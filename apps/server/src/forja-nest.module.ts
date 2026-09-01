import { CanActivate, Controller, DynamicModule, ExecutionContext, Get, Global, Inject, Injectable, Module, Optional, Post, Req, Res, Sse, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { Observable as RxObservable } from 'rxjs';
import { ForjaNestAdapter, isLoopbackAddress, type EventStream, type HttpRequest, type LocalAuthenticator } from '../../../packages/adapter-nest/src/index.ts';
import type { McpServer } from '../../../packages/mcp/src/index.ts';
import type { ControlPlanePort } from '../../../packages/observability/src/index.ts';

export const FORJA_MCP = Symbol('FORJA_MCP');
export const FORJA_EVENT_STREAM = Symbol('FORJA_EVENT_STREAM');
export const FORJA_AUTHENTICATOR = Symbol('FORJA_AUTHENTICATOR');
export const FORJA_CONTROL_PLANE = Symbol('FORJA_CONTROL_PLANE');

export interface ForjaNestModuleOptions {
  readonly mcp: McpServer;
  readonly eventStream?: EventStream;
  readonly authenticator?: LocalAuthenticator;
  readonly controlPlane?: ControlPlanePort;
}

function headers(request: Request): Readonly<Record<string, string | undefined>> {
  return Object.fromEntries(Object.entries(request.headers).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
}

@Injectable()
export class ForjaLocalAuthGuard implements CanActivate {
  private readonly authenticator?: LocalAuthenticator;
  constructor(@Optional() @Inject(FORJA_AUTHENTICATOR) authenticator?: LocalAuthenticator) { this.authenticator = authenticator; }
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (this.authenticator === undefined) {
      // Fail closed, not open: no FORJA_AUTH_TOKEN configured means loopback-only, not allow-all —
      // otherwise a port-forward or container-network hop reaches this server fully unauthenticated.
      if (isLoopbackAddress(request.socket?.remoteAddress)) return true;
      throw new UnauthorizedException('Local authentication required (no FORJA_AUTH_TOKEN configured; only loopback requests are allowed)');
    }
    if (await this.authenticator.authenticate(headers(request))) return true;
    throw new UnauthorizedException('Local authentication required');
  }
}

@Controller()
@UseGuards(ForjaLocalAuthGuard)
export class ForjaNestController {
  private readonly adapter: ForjaNestAdapter;
  constructor(adapter: ForjaNestAdapter) { this.adapter = adapter; }

  @Get('health') health(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<unknown> { return this.route(request, response, 'GET', '/health'); }
  @Get('api/capabilities') capabilities(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<unknown> { return this.route(request, response, 'GET', '/api/capabilities'); }
  @Post('api/capabilities/:id/execute') execute(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<unknown> { return this.route(request, response, 'POST', `/api/capabilities/${request.params.id}/execute`, request.body); }
  @Post('api/context/build') context(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<unknown> { return this.route(request, response, 'POST', '/api/context/build', request.body); }
  @Get('api/graph/query') graphQuery(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<unknown> { return this.route(request, response, 'GET', '/api/graph/query'); }
  @Get('api/graph/impact') graphImpact(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<unknown> { return this.route(request, response, 'GET', '/api/graph/impact'); }
  @Get('api/tasks/next') taskNext(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<unknown> { return this.route(request, response, 'GET', '/api/tasks/next'); }
  @Post('api/handoffs') handoff(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<unknown> { return this.route(request, response, 'POST', '/api/handoffs', request.body); }
  @Post('api/executions') runtimeStart(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<unknown> { return this.route(request, response, 'POST', '/api/executions', request.body); }
  @Get('api/executions/:id') runtimeGet(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<unknown> { return this.route(request, response, 'GET', `/api/executions/${request.params.id}`); }
  @Post('api/executions/:id/execute') runtimeExecute(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<unknown> { return this.route(request, response, 'POST', `/api/executions/${request.params.id}/execute`); }
  @Post('api/executions/:id/pause') runtimePause(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<unknown> { return this.route(request, response, 'POST', `/api/executions/${request.params.id}/pause`); }
  @Post('api/executions/:id/resume') runtimeResume(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<unknown> { return this.route(request, response, 'POST', `/api/executions/${request.params.id}/resume`); }
  @Post('api/executions/:id/cancel') runtimeCancel(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<unknown> { return this.route(request, response, 'POST', `/api/executions/${request.params.id}/cancel`); }
  @Post('api/sprints') sprintCreate(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<unknown> { return this.route(request, response, 'POST', '/api/sprints', request.body); }
  @Post('api/sprints/:id/start') sprintStart(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<unknown> { return this.route(request, response, 'POST', `/api/sprints/${request.params.id}/start`); }
  @Post('api/sprints/:id/pause') sprintPause(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<unknown> { return this.route(request, response, 'POST', `/api/sprints/${request.params.id}/pause`); }
  @Post('api/tasks') taskCreate(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<unknown> { return this.route(request, response, 'POST', '/api/tasks', request.body); }
  @Post('api/tasks/:id/start') taskStart(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<unknown> { return this.route(request, response, 'POST', `/api/tasks/${request.params.id}/start`); }
  @Post('api/tasks/:id/block') taskBlock(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<unknown> { return this.route(request, response, 'POST', `/api/tasks/${request.params.id}/block`); }
  @Get('api/approvals/:id') approvalGet(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<unknown> { return this.route(request, response, 'GET', `/api/approvals/${request.params.id}`); }
  @Post('api/approvals/:id/decide') approvalDecide(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<unknown> { return this.route(request, response, 'POST', `/api/approvals/${request.params.id}/decide`, request.body); }
  @Get('mcp/tools') tools(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<unknown> { return this.route(request, response, 'GET', '/mcp/tools'); }
  @Get('mcp/resources') resources(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<unknown> { return this.route(request, response, 'GET', '/mcp/resources'); }

  @Sse('api/events') events(): Observable<{ readonly id: string; readonly type: string; readonly data: unknown }> {
    return new RxObservable((subscriber) => {
      try {
        const unsubscribe = this.adapter.subscribeSse((event) => subscriber.next({ id: event.id, type: event.event, data: event.data }));
        return () => unsubscribe();
      } catch (error: unknown) { subscriber.error(error); return undefined; }
    });
  }

  private async route(request: Request, response: Response, method: HttpRequest['method'], path: string, body?: unknown): Promise<unknown> {
    const result = await this.adapter.handle({ method, path, query: request.query as Readonly<Record<string, string | undefined>>, body, headers: headers(request), correlationId: this.correlation(request), remoteAddress: request.socket?.remoteAddress });
    response.status(result.status);
    for (const [key, value] of Object.entries(result.headers)) response.setHeader(key, value);
    return result.body;
  }

  private correlation(request: Request): string | undefined { const value = request.headers['x-correlation-id']; return Array.isArray(value) ? value[0] : value; }
}

@Global()
@Module({})
export class ForjaNestModule {
  static register(options: ForjaNestModuleOptions): DynamicModule {
    return {
      module: ForjaNestModule,
      controllers: [ForjaNestController],
      providers: [
        { provide: FORJA_MCP, useValue: options.mcp },
        { provide: FORJA_EVENT_STREAM, useValue: options.eventStream },
        { provide: FORJA_AUTHENTICATOR, useValue: options.authenticator },
        { provide: FORJA_CONTROL_PLANE, useValue: options.controlPlane },
        ForjaLocalAuthGuard,
        { provide: ForjaNestAdapter, useFactory: (mcp: McpServer, stream?: EventStream, authenticator?: LocalAuthenticator, controlPlane?: ControlPlanePort) => new ForjaNestAdapter(mcp, stream, authenticator, controlPlane), inject: [FORJA_MCP, FORJA_EVENT_STREAM, FORJA_AUTHENTICATOR, FORJA_CONTROL_PLANE] },
      ],
      exports: [ForjaNestAdapter],
    };
  }
}
