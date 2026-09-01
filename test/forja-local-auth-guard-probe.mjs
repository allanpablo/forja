import assert from 'node:assert/strict';
import { ForjaLocalAuthGuard } from '../apps/server/src/forja-nest.module.ts';

// forja-nest.module.ts uses Nest decorators (@Injectable, @Controller, ...), which plain
// `node --test` can't parse (type-stripping only, no decorator transform) — this probe runs under
// `node --import tsx`, same as test/server-persistence-probe.mjs, and is invoked by
// test/forja-local-auth-guard.test.js as a subprocess.

function fakeExecutionContext(request) {
  return { switchToHttp: () => ({ getRequest: () => request }) };
}

async function main() {
  {
    // Sem FORJA_AUTH_TOKEN configurado, loopback continua permitido (não quebra o dev local).
    const guard = new ForjaLocalAuthGuard(undefined);
    const loopbackRequest = { headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    assert.equal(await guard.canActivate(fakeExecutionContext(loopbackRequest)), true);
  }
  {
    // Sem FORJA_AUTH_TOKEN configurado, um endereço remoto real é negado (fail-closed, não allow-all).
    const guard = new ForjaLocalAuthGuard(undefined);
    const remoteRequest = { headers: {}, socket: { remoteAddress: '203.0.113.5' } };
    await assert.rejects(() => guard.canActivate(fakeExecutionContext(remoteRequest)), /Local authentication required/);
  }
  {
    // Com token configurado, o endereço deixa de importar: exige Bearer válido mesmo de loopback.
    const guard = new ForjaLocalAuthGuard({ authenticate: (headers) => headers.authorization === 'Bearer local-token' });
    const loopbackWithoutToken = { headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    await assert.rejects(() => guard.canActivate(fakeExecutionContext(loopbackWithoutToken)), /Local authentication required/);
    const remoteWithToken = { headers: { authorization: 'Bearer local-token' }, socket: { remoteAddress: '203.0.113.5' } };
    assert.equal(await guard.canActivate(fakeExecutionContext(remoteWithToken)), true);
  }
  console.log('OK');
}

await main();
