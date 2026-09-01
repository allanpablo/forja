import { randomUUID } from 'node:crypto';
import {
  CONTRACT_VERSION,
  type AgentIdentity,
  type AgentProfile,
  type CapabilityDefinition,
  type CapabilityId,
  type CapabilityInput,
  type CapabilityOutput,
  type ExecutionError,
  type ExecutionResult,
  type PolicyDecision,
  type RunId,
  type ISO8601,
  type TokenBudget,
  validateCapabilityDefinition,
} from '../../contracts/src/index.ts';

export interface CapabilityExecutionContext {
  readonly runId: RunId;
  readonly agent: AgentIdentity;
  readonly definition: CapabilityDefinition;
}

export interface CapabilityRegistration<Input, Output> {
  readonly definition: CapabilityDefinition;
  readonly validateInput: (value: unknown) => Input;
  readonly validateOutput: (value: unknown) => Output;
  readonly handler: (input: Input, context: CapabilityExecutionContext) => CapabilityOutput | Promise<CapabilityOutput>;
}

export interface CapabilityAuthorizationRequest {
  readonly definition: CapabilityDefinition;
  readonly input: CapabilityInput;
  readonly agent: AgentIdentity;
  readonly correlationId?: string;
  readonly projectId?: string;
  readonly environment: string;
  readonly categories: readonly string[];
  readonly files: readonly string[];
  readonly budget?: TokenBudget;
  readonly now: ISO8601;
  readonly approval?: {
    readonly action: string;
    readonly justification: string;
    readonly impact: string;
    readonly expectedDiff?: string;
    readonly expiresAt: ISO8601;
  };
}

export interface CapabilityPolicy {
  authorize(request: CapabilityAuthorizationRequest): PolicyDecision;
  canDiscover?(definition: CapabilityDefinition, agent?: AgentProfile): boolean;
}

export interface CapabilityListFilter {
  readonly agent?: AgentProfile;
  readonly policy?: CapabilityPolicy;
}

export interface CapabilityExecutionRequest {
  readonly input: CapabilityInput;
  readonly agent: AgentIdentity;
  readonly policy: CapabilityPolicy;
  readonly correlationId?: string;
  readonly projectId?: string;
  readonly environment?: string;
  readonly categories?: readonly string[];
  readonly files?: readonly string[];
  readonly budget?: TokenBudget;
  readonly approval?: CapabilityAuthorizationRequest['approval'];
}

export class CapabilityRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CapabilityRegistryError';
  }
}

export class CapabilityRegistry {
  private readonly registrations = new Map<CapabilityId, CapabilityRegistration<unknown, unknown>>();
  private readonly aliases = new Map<string, CapabilityId>();

  register<Input, Output>(registration: CapabilityRegistration<Input, Output>): void {
    const definition = validateCapabilityDefinition(registration.definition);
    const id = definition.id;
    if (this.registrations.has(id)) {
      throw new CapabilityRegistryError(`Capability already registered: ${id}`);
    }

    const names = [id, ...definition.aliases];
    for (const name of names) {
      const existing = this.aliases.get(name);
      if (existing !== undefined) {
        throw new CapabilityRegistryError(`Capability name already registered: ${name}`);
      }
    }

    const stored: CapabilityRegistration<unknown, unknown> = {
      definition,
      validateInput: registration.validateInput as (value: unknown) => unknown,
      validateOutput: registration.validateOutput as (value: unknown) => unknown,
      handler: registration.handler as (input: unknown, context: CapabilityExecutionContext) => CapabilityOutput | Promise<CapabilityOutput>,
    };
    this.registrations.set(id, stored);
    for (const name of names) this.aliases.set(name, id);
  }

  list(filter: CapabilityListFilter = {}): readonly CapabilityDefinition[] {
    return [...this.registrations.values()]
      .map((registration) => registration.definition)
      .filter((definition) => this.isVisible(definition, filter))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  describe(idOrAlias: string, filter: CapabilityListFilter = {}): CapabilityDefinition {
    const definition = this.resolve(idOrAlias).definition;
    if (!this.isVisible(definition, filter)) {
      throw new CapabilityRegistryError(`Capability not discoverable: ${idOrAlias}`);
    }
    return definition;
  }

  async execute(request: CapabilityExecutionRequest): Promise<ExecutionResult> {
    const runId = this.createRunId();
    const timestamps = this.auditFields(request.correlationId ?? runId);
    const resolved = this.tryResolve(request.input.capabilityId);
    if (resolved.error !== undefined) {
      return this.failure(runId, timestamps, resolved.error);
    }

    const registration = resolved.registration;
    let input: unknown;
    try {
      input = registration.validateInput(request.input.payload);
    } catch (error: unknown) {
      return this.failure(runId, timestamps, this.toExecutionError('INVALID_INPUT', error, false));
    }

    let decision: PolicyDecision;
    try {
      decision = request.policy.authorize({
        definition: registration.definition,
        input: request.input,
        agent: request.agent,
        correlationId: request.correlationId ?? runId,
        projectId: request.projectId,
        environment: request.environment ?? 'local',
        categories: request.categories ?? [],
        files: request.files ?? [],
        budget: request.budget,
        now: timestamps.createdAt,
        approval: request.approval,
      });
    } catch (error: unknown) {
      return this.failure(runId, timestamps, this.toExecutionError('POLICY_ERROR', error, false));
    }
    if (decision.effect === 'DENY' || decision.effect === 'REQUIRE_APPROVAL') {
      return {
        ...timestamps,
        runId,
        status: 'blocked',
        error: {
          code: decision.effect === 'DENY' ? 'POLICY_DENIED' : 'APPROVAL_REQUIRED',
          message: decision.reason,
          retryable: false,
        },
        evidence: [],
      };
    }

    // `ALLOW_WITH_LIMITS` is only meaningful if the limits it carries actually bound the call —
    // otherwise it behaves exactly like ALLOW, silently. maxFiles and maxTokens are checked here
    // because both are already known before the handler runs; maxDurationMs/maxRetries govern
    // the runtime engine's own retry/step loop (RuntimeEngine.limits) rather than a single call.
    const limitError = this.checkLimits(decision, request);
    if (limitError !== undefined) return this.failure(runId, timestamps, limitError);

    try {
      const output = await registration.handler(input, { runId, agent: request.agent, definition: registration.definition });
      registration.validateOutput(output.payload);
      if (output.capabilityId !== registration.definition.id) throw new Error('Handler output capabilityId does not match definition');
      return { ...timestamps, runId, status: 'succeeded', output, evidence: output.evidence };
    } catch (error: unknown) {
      return this.failure(runId, timestamps, this.toExecutionError('HANDLER_FAILED', error, true));
    }
  }

  private checkLimits(decision: PolicyDecision, request: CapabilityExecutionRequest): ExecutionError | undefined {
    const limits = decision.limits;
    if (limits === undefined) return undefined;
    const fileCount = request.files?.length ?? 0;
    if (limits.maxFiles !== undefined && fileCount > limits.maxFiles) {
      return { code: 'POLICY_LIMIT_EXCEEDED', message: `Policy limit exceeded: ${fileCount} files touched, maxFiles is ${limits.maxFiles}`, retryable: false };
    }
    const requestedTokens = request.budget?.totalTokens ?? 0;
    if (limits.maxTokens !== undefined && requestedTokens > limits.maxTokens) {
      return { code: 'POLICY_LIMIT_EXCEEDED', message: `Policy limit exceeded: budget of ${requestedTokens} tokens exceeds maxTokens ${limits.maxTokens}`, retryable: false };
    }
    return undefined;
  }

  private resolve(idOrAlias: string): CapabilityRegistration<unknown, unknown> {
    const id = this.aliases.get(idOrAlias);
    if (id === undefined) throw new CapabilityRegistryError(`Capability not found: ${idOrAlias}`);
    const registration = this.registrations.get(id);
    if (registration === undefined) throw new CapabilityRegistryError(`Capability registry is inconsistent: ${id}`);
    return registration;
  }

  private tryResolve(idOrAlias: string): { registration: CapabilityRegistration<unknown, unknown>; error?: undefined } | { registration?: undefined; error: ExecutionError } {
    try {
      return { registration: this.resolve(idOrAlias) };
    } catch (error: unknown) {
      return { error: this.toExecutionError('CAPABILITY_NOT_FOUND', error, false) };
    }
  }

  private isVisible(definition: CapabilityDefinition, filter: CapabilityListFilter): boolean {
    if (filter.agent !== undefined && !definition.permissions.every((permission) => filter.agent?.permissions.includes(permission))) return false;
    return filter.policy?.canDiscover?.(definition, filter.agent) ?? true;
  }

  private createRunId(): RunId {
    return randomUUID() as RunId;
  }

  private auditFields(correlationId: string): Pick<ExecutionResult, 'schemaVersion' | 'createdAt' | 'updatedAt' | 'correlationId'> {
    const now = new Date().toISOString() as ISO8601;
    return { schemaVersion: CONTRACT_VERSION, createdAt: now, updatedAt: now, correlationId };
  }

  private failure(runId: RunId, fields: Pick<ExecutionResult, 'schemaVersion' | 'createdAt' | 'updatedAt' | 'correlationId'>, error: ExecutionError): ExecutionResult {
    return { ...fields, runId, status: 'failed', error, evidence: [] };
  }

  private toExecutionError(code: string, error: unknown, retryable: boolean): ExecutionError {
    const message = error instanceof Error ? error.message : 'Unknown capability error';
    return { code, message, retryable };
  }
}
