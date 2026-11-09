// @ts-expect-error Next resolves the adjacent TypeScript helper.
import { buildApprovalDecisionBody } from '../approval';
// @ts-expect-error Next resolves the adjacent TypeScript helper.
import { isCallerAuthorized, matchesAllowedPrefix } from '../guard';
// @ts-expect-error Next resolves the adjacent TypeScript helper.
import { capabilityIdFromExecutePath, isReadOnlyCapability } from '../capabilities';

const allowedPrefixes = ['/control-plane/metrics', '/observability/observations', '/events', '/executions/', '/graph/query', '/graph/impact', '/approvals', '/capabilities'];

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }): Promise<Response> { return forward(request, await context.params, 'GET'); }
export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }): Promise<Response> { return forward(request, await context.params, 'POST'); }

async function forward(request: Request, params: { path: string[] }, method: 'GET' | 'POST'): Promise<Response> {
  // Fails closed: without FORJA_DASHBOARD_TOKEN configured, or without the caller presenting it,
  // this route refuses every request rather than silently forwarding the server's own backend
  // credential (FORJA_API_TOKEN, below) on an unauthenticated caller's behalf.
  if (!isCallerAuthorized(request)) return new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Dashboard caller authentication required' } }), { status: 403, headers: { 'content-type': 'application/json' } });
  const path = `/${params.path.join('/')}`;
  if (!allowedPrefixes.some((prefix) => matchesAllowedPrefix(path, prefix))) return new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Dashboard route is not allowed' } }), { status: 403, headers: { 'content-type': 'application/json' } });
  const backend = process.env.FORJA_API_URL ?? 'http://localhost:3000';
  const token = process.env.FORJA_API_TOKEN;
  // ADR-0022, condição de retomada #2: o que o painel alcança é derivado do que o servidor declara,
  // nunca de uma lista escrita à mão aqui. O dashboard anterior mantinha allowlist própria e por ela
  // rodava comando que não passava pelos gates nem aparecia na auditoria; este portão existe para
  // que executar pela UI seja o mesmo caminho auditado de sempre, e só para capacidades que não
  // escrevem. Falha fechada: catálogo que não responde é 403, não é liberado.
  if (method === 'POST') {
    const capabilityId = capabilityIdFromExecutePath(path);
    if (capabilityId !== null) {
      const surface = await readCapabilitySurface(`${backend}/api/capabilities`, token, capabilityId);
      if (surface === null || !isReadOnlyCapability(surface)) return new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: `Capability is not read-only: ${capabilityId}` } }), { status: 403, headers: { 'content-type': 'application/json' } });
    }
  }
  const headers = new Headers({ accept: request.headers.get('accept') ?? 'application/json' });
  if (token !== undefined) headers.set('authorization', `Bearer ${token}`);
  if (method === 'POST') headers.set('content-type', request.headers.get('content-type') ?? 'application/json');
  let body: ArrayBuffer | undefined;
  if (method === 'POST') {
    if (path.endsWith('/decide')) {
      try { body = new TextEncoder().encode(JSON.stringify(buildApprovalDecisionBody(await request.json() as unknown, process.env.FORJA_APPROVER_ID ?? '', new Date().toISOString()))).buffer; }
      catch (error: unknown) { return new Response(JSON.stringify({ error: { code: 'APPROVAL_CONFIGURATION', message: error instanceof Error ? error.message : 'Approval configuration is invalid' } }), { status: 503, headers: { 'content-type': 'application/json' } }); }
    } else body = await request.arrayBuffer();
  }
  const response = await fetch(`${backend}/api${path}${new URL(request.url).search}`, { method, headers, body, cache: 'no-store' });
  const responseHeaders = new Headers({ 'content-type': response.headers.get('content-type') ?? 'application/json' });
  const cacheControl = response.headers.get('cache-control');
  if (cacheControl !== null) responseHeaders.set('cache-control', cacheControl);
  return new Response(response.body, { status: response.status, headers: responseHeaders });
}

/** A definição que o servidor declara para a capacidade, ou null quando o catálogo não responde. */
async function readCapabilitySurface(catalogUrl: string, token: string | undefined, id: string) {
  const headers = new Headers({ accept: 'application/json' });
  if (token !== undefined) headers.set('authorization', `Bearer ${token}`);
  try {
    const catalog = await fetch(catalogUrl, { headers, cache: 'no-store' });
    if (!catalog.ok) return null;
    const definitions = await catalog.json() as unknown;
    if (!Array.isArray(definitions)) return null;
    return definitions.find((definition) => (definition as { id?: unknown }).id === id) ?? null;
  } catch { return null; }
}
