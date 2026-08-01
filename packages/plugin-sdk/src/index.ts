import type { CapabilityId, DomainEvent, EntityId, ExecutionResult, Handoff, RuntimeRun, Sprint, Task } from '../../contracts/src/index.ts';

export type PluginPermission = 'workspace:read' | 'capabilities:list' | 'capability:execute' | 'runtime:start' | 'graph:read' | 'sprint:create' | 'task:create' | 'handoff:create' | 'events:subscribe' | 'approval:respond';
export type PluginEventHandler = (event: DomainEvent) => void;

export interface PluginManifest {
  readonly id: string;
  readonly version: string;
  readonly capabilities: readonly CapabilityId[];
  readonly permissions: readonly PluginPermission[];
  readonly events: readonly string[];
  readonly migrations: readonly string[];
  readonly dashboardExtensions: readonly string[];
  readonly compatibleCore: string;
  readonly signature?: string;
}

export interface PluginServices {
  readonly workspaceStatus?: () => unknown | Promise<unknown>;
  readonly listCapabilities?: () => readonly unknown[] | Promise<readonly unknown[]>;
  readonly executeCapability?: (id: CapabilityId, payload: unknown) => ExecutionResult | Promise<ExecutionResult>;
  readonly startRuntime?: (input: unknown) => RuntimeRun | Promise<RuntimeRun>;
  readonly queryGraph?: (query: unknown) => readonly unknown[] | Promise<readonly unknown[]>;
  readonly createSprint?: (input: unknown) => Sprint | Promise<Sprint>;
  readonly createTask?: (input: unknown) => Task | Promise<Task>;
  readonly createHandoff?: (input: unknown) => Handoff | Promise<Handoff>;
  readonly subscribeEvents?: (handler: PluginEventHandler) => () => void;
  readonly respondApproval?: (requestId: EntityId, input: unknown) => unknown | Promise<unknown>;
}

export interface PluginContext {
  readonly manifest: PluginManifest;
  readonly workspaceStatus: () => Promise<unknown>;
  readonly listCapabilities: () => Promise<readonly unknown[]>;
  readonly executeCapability: (id: CapabilityId, payload: unknown) => Promise<ExecutionResult>;
  readonly startRuntime: (input: unknown) => Promise<RuntimeRun>;
  readonly queryGraph: (query: unknown) => Promise<readonly unknown[]>;
  readonly createSprint: (input: unknown) => Promise<Sprint>;
  readonly createTask: (input: unknown) => Promise<Task>;
  readonly createHandoff: (input: unknown) => Promise<Handoff>;
  readonly subscribeEvents: (handler: PluginEventHandler) => () => void;
  readonly respondApproval: (requestId: EntityId, input: unknown) => Promise<unknown>;
}

export interface PluginDefinition { readonly manifest: PluginManifest; readonly setup?: (context: PluginContext) => void | Promise<void>; }

export class PluginError extends Error { constructor(message: string) { super(message); this.name = 'PluginError'; } }

export class PluginRegistry {
  private readonly plugins = new Map<string, PluginManifest>();
  private readonly services: PluginServices;
  constructor(services: PluginServices) { this.services = services; }

  async register(definition: PluginDefinition): Promise<PluginContext> {
    this.validateManifest(definition.manifest);
    if (this.plugins.has(definition.manifest.id)) throw new PluginError(`Plugin already registered: ${definition.manifest.id}`);
    this.plugins.set(definition.manifest.id, definition.manifest);
    const context = this.context(definition.manifest);
    try { if (definition.setup !== undefined) await definition.setup(context); return context; }
    catch (error: unknown) { this.plugins.delete(definition.manifest.id); throw error; }
  }

  list(): readonly PluginManifest[] { return [...this.plugins.values()]; }
  get(id: string): PluginManifest | undefined { return this.plugins.get(id); }

  private context(manifest: PluginManifest): PluginContext {
    const requirePermission = (permission: PluginPermission): void => { if (!manifest.permissions.includes(permission)) throw new PluginError(`Plugin ${manifest.id} lacks permission ${permission}`); };
    const service = <T>(permission: PluginPermission, value: T | undefined, name: string): T => { requirePermission(permission); if (value === undefined) throw new PluginError(`Plugin service is not configured: ${name}`); return value; };
    return {
      manifest,
      workspaceStatus: async () => service('workspace:read', this.services.workspaceStatus, 'workspaceStatus')(),
      listCapabilities: async () => service('capabilities:list', this.services.listCapabilities, 'listCapabilities')(),
      executeCapability: async (id, payload) => service('capability:execute', this.services.executeCapability, 'executeCapability')(id, payload),
      startRuntime: async (input) => service('runtime:start', this.services.startRuntime, 'startRuntime')(input),
      queryGraph: async (query) => service('graph:read', this.services.queryGraph, 'queryGraph')(query),
      createSprint: async (input) => service('sprint:create', this.services.createSprint, 'createSprint')(input),
      createTask: async (input) => service('task:create', this.services.createTask, 'createTask')(input),
      createHandoff: async (input) => service('handoff:create', this.services.createHandoff, 'createHandoff')(input),
      subscribeEvents: (handler) => { requirePermission('events:subscribe'); const subscribe = service('events:subscribe', this.services.subscribeEvents, 'subscribeEvents'); return subscribe(handler); },
      respondApproval: async (id, input) => service('approval:respond', this.services.respondApproval, 'respondApproval')(id, input),
    };
  }

  private validateManifest(manifest: PluginManifest): void {
    if (!/^[a-z0-9]+(?:[-.][a-z0-9]+)*$/.test(manifest.id)) throw new PluginError('Plugin id must be lowercase and namespaced');
    if (manifest.version.trim() === '' || manifest.compatibleCore.trim() === '') throw new PluginError('Plugin version and compatibleCore are required');
    if (new Set(manifest.permissions).size !== manifest.permissions.length) throw new PluginError('Plugin permissions must be unique');
    if (new Set(manifest.capabilities).size !== manifest.capabilities.length) throw new PluginError('Plugin capabilities must be unique');
  }
}
