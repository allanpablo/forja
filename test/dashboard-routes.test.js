import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const controller = fs.readFileSync(path.join(root, 'apps/server/src/forja-nest.module.ts'), 'utf8');
const proxy = fs.readFileSync(path.join(root, 'apps/dashboard/app/api/forja/[...path]/route.ts'), 'utf8');

/** Rotas que o controller Nest realmente mapeia, normalizadas para `/api/...`. */
function mappedRoutes() {
  return [...controller.matchAll(/@(?:Get|Post|Sse)\('([^']+)'\)/g)].map((match) => `/${match[1]}`);
}

function allowedPrefixes() {
  const literal = /const allowedPrefixes = \[([^\]]+)\]/.exec(proxy);
  assert.ok(literal, 'allowedPrefixes não encontrado no proxy do dashboard');
  return [...literal[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

// O painel já encaminhou `/events/stream` enquanto o controller só mapeava `/api/events`, e
// `/control-plane/metrics`, `/observability/observations` e `/api/approvals` existiam no dispatch do
// adapter mas não tinham decorator — a aba Operação inteira dava 404. O proxy e o controller são
// arquivos separados que precisam concordar; este teste é a concordância.
test('dashboard: todo prefixo liberado pelo proxy existe como rota mapeada no controller Nest', () => {
  const routes = mappedRoutes();
  assert.ok(routes.length > 20, `esperava o catálogo de rotas do controller, obtive ${routes.length}`);
  for (const prefix of allowedPrefixes()) {
    const backend = `/api${prefix}`;
    const boundary = backend.endsWith('/') ? backend : `${backend}/`;
    const covered = routes.some((route) => route === backend || route.startsWith(boundary));
    assert.ok(covered, `proxy libera ${prefix} mas o controller não mapeia ${backend} (rotas: ${routes.join(', ')})`);
  }
});

test('dashboard: as rotas de leitura que a aba Operação consome estão mapeadas', () => {
  const routes = mappedRoutes();
  for (const required of ['/api/control-plane/metrics', '/api/observability/observations', '/api/approvals', '/api/events', '/api/graph/query', '/api/graph/impact']) {
    assert.ok(routes.includes(required), `controller não mapeia ${required}`);
  }
});

// Nest casa rota na ordem de declaração: `api/approvals/:id` antes de `api/approvals` capturaria a
// lista com id="..." e a coleção nunca responderia.
test('dashboard: a lista de aprovações é declarada antes da rota com :id', () => {
  const list = controller.indexOf("@Get('api/approvals')");
  const byId = controller.indexOf("@Get('api/approvals/:id')");
  assert.ok(list >= 0, 'rota de lista de aprovações ausente');
  assert.ok(byId >= 0, 'rota de aprovação por id ausente');
  assert.ok(list < byId, 'a lista precisa vir antes de /:id para não ser capturada por ela');
});