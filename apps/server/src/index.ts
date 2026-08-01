import type { McpServer } from '../../../packages/mcp/src/index.ts';
import { ForjaNestAdapter, type EventStream, type LocalAuthenticator, type NestModuleDefinition } from '../../../packages/adapter-nest/src/index.ts';
import type { ControlPlanePort } from '../../../packages/observability/src/index.ts';

export interface ForjaServerOptions {
  readonly mcp: McpServer;
  readonly eventStream?: EventStream;
  readonly authenticator?: LocalAuthenticator;
  readonly controlPlane?: ControlPlanePort;
}

export class ForjaServerApplication {
  readonly http: ForjaNestAdapter;
  constructor(options: ForjaServerOptions) { this.http = new ForjaNestAdapter(options.mcp, options.eventStream, options.authenticator, options.controlPlane); }
  modules(): readonly NestModuleDefinition[] { return this.http.modules(); }
}

export function createForjaServer(options: ForjaServerOptions): ForjaServerApplication { return new ForjaServerApplication(options); }
