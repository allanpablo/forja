import { createHash, randomUUID } from 'node:crypto';
import {
  CONTRACT_VERSION,
  type ContextMetrics,
  type ContextPackage,
  type EntityId,
  type Evidence,
  type ISO8601,
  type KnowledgeStatus,
  type TokenBudget,
  validateTokenBudget,
} from '../../contracts/src/index.ts';

export interface ContextCandidate {
  readonly id: EntityId;
  readonly source: 'memory' | 'graph';
  readonly locator: string;
  readonly content: string;
  readonly relevance: number;
  readonly status: KnowledgeStatus;
  readonly evidence: readonly Evidence[];
  readonly checksum?: string;
  readonly obsolete?: boolean;
}

export interface ContextSource {
  search(objective: string): readonly ContextCandidate[] | Promise<readonly ContextCandidate[]>;
}

export interface ContextCache {
  get(checksum: string): string | undefined;
  set(checksum: string, content: string): void;
}

export interface ContextBuildRequest {
  readonly objective: string;
  readonly budget: TokenBudget;
  readonly includeContent?: boolean;
  readonly maxItems?: number;
  readonly requireEvidence?: boolean;
  readonly correlationId?: string;
}

export interface ContextDependencies {
  readonly memory?: ContextSource;
  readonly graph?: ContextSource;
  readonly cache?: ContextCache;
}

export class ContextEngineError extends Error {
  readonly code: 'INVALID_REQUEST' | 'INSUFFICIENT_EVIDENCE' | 'CONTEXT_BUDGET_EXCEEDED' | 'CONTENT_NOT_CACHED';

  constructor(code: ContextEngineError['code'], message: string) {
    super(message);
    this.name = 'ContextEngineError';
    this.code = code;
  }
}

export class InMemoryContextCache implements ContextCache {
  private readonly values = new Map<string, string>();

  get(checksum: string): string | undefined {
    return this.values.get(checksum);
  }

  set(checksum: string, content: string): void {
    this.values.set(checksum, content);
  }
}

export class ContextEngine {
  private readonly dependencies: ContextDependencies;

  constructor(dependencies: ContextDependencies) {
    this.dependencies = dependencies;
  }

  async build(request: ContextBuildRequest): Promise<ContextPackage> {
    if (request.objective.trim().length === 0) throw new ContextEngineError('INVALID_REQUEST', 'Context objective is required');
    validateTokenBudget(request.budget);
    const maxItems = request.maxItems ?? Number.MAX_SAFE_INTEGER;
    if (!Number.isInteger(maxItems) || maxItems < 1) throw new ContextEngineError('INVALID_REQUEST', 'maxItems must be a positive integer');

    const sources = [this.dependencies.memory, this.dependencies.graph].filter((source): source is ContextSource => source !== undefined);
    const results = await Promise.all(sources.map((source) => source.search(request.objective)));
    const candidates = results.flat().filter((candidate) => this.isUsable(candidate));
    if (candidates.length === 0 && (request.requireEvidence ?? true)) throw new ContextEngineError('INSUFFICIENT_EVIDENCE', 'No current evidence matches the context objective');

    const ranked = candidates
      .map((candidate) => ({ candidate, checksum: candidate.checksum ?? this.checksum(candidate.content) }))
      .sort((left, right) => right.candidate.relevance - left.candidate.relevance || left.candidate.locator.localeCompare(right.candidate.locator) || left.checksum.localeCompare(right.checksum));
    const unique = new Map<string, { candidate: ContextCandidate; checksum: string }>();
    for (const item of ranked) if (!unique.has(item.checksum)) unique.set(item.checksum, item);

    const availableTokens = request.budget.totalTokens - request.budget.usedTokens;
    let usedTokens = 0;
    let cacheHits = 0;
    const selected: Array<{ candidate: ContextCandidate; checksum: string; tokens: number }> = [];
    for (const item of [...unique.values()].slice(0, maxItems)) {
      const tokens = this.estimateTokens(item.candidate.content);
      if (usedTokens + tokens > availableTokens) continue;
      if (this.dependencies.cache?.get(item.checksum) !== undefined) cacheHits += 1;
      else this.dependencies.cache?.set(item.checksum, item.candidate.content);
      selected.push({ ...item, tokens });
      usedTokens += tokens;
    }
    if (selected.length === 0 && (request.requireEvidence ?? true)) throw new ContextEngineError('CONTEXT_BUDGET_EXCEEDED', 'Context budget cannot fit any evidence');

    const references = this.uniqueEvidence(selected.flatMap((item) => item.candidate.evidence));
    const content = request.includeContent === false ? [] : selected.map((item) => item.candidate.content);
    const metrics: ContextMetrics = {
      candidateCount: candidates.length,
      selectedCount: selected.length,
      deduplicatedCount: candidates.length - unique.size,
      cacheHits,
      selectedTokens: usedTokens,
      unusedTokens: availableTokens - usedTokens,
    };
    const fields = this.auditFields(request.correlationId ?? randomUUID());
    return {
      ...fields,
      id: randomUUID() as EntityId,
      references,
      content,
      budget: { ...request.budget, usedTokens: request.budget.usedTokens + usedTokens },
      checksum: this.checksum(JSON.stringify({ objective: request.objective, refs: selected.map((item) => item.checksum), includeContent: request.includeContent !== false })),
      metrics,
    };
  }

  expand(checksum: string): string {
    const content = this.dependencies.cache?.get(checksum);
    if (content === undefined) throw new ContextEngineError('CONTENT_NOT_CACHED', `Context content is not cached: ${checksum}`);
    return content;
  }

  private isUsable(candidate: ContextCandidate): boolean {
    return !candidate.obsolete && candidate.status !== 'contradicted' && candidate.content.trim().length > 0 && Number.isFinite(candidate.relevance) && candidate.evidence.length > 0;
  }

  private estimateTokens(content: string): number {
    return Math.max(1, Math.ceil(Buffer.byteLength(content, 'utf8') / 4));
  }

  private checksum(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private uniqueEvidence(evidence: readonly Evidence[]): readonly Evidence[] {
    const unique = new Map<EntityId, Evidence>();
    for (const item of evidence) if (!unique.has(item.id)) unique.set(item.id, item);
    return [...unique.values()];
  }

  private auditFields(correlationId: string): Pick<ContextPackage, 'schemaVersion' | 'createdAt' | 'updatedAt' | 'correlationId'> {
    const now = new Date().toISOString() as ISO8601;
    return { schemaVersion: CONTRACT_VERSION, createdAt: now, updatedAt: now, correlationId };
  }
}
