import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseArgv, argvFor, makeValidator } from '../apps/cli/src/params.ts';
import { CLI_CAPABILITY_SPECS } from '../apps/cli/src/index.ts';
import { COMMANDS } from '../lib/core/registry.ts';

// --- unidade: os kinds --------------------------------------------------------

test('parseArgv/argvFor: positional obrigatório e opcional', () => {
  const p = [
    { name: 'symbol', kind: 'positional', required: true },
    { name: 'depth', kind: 'positional', parse: 'int' },
  ];
  assert.deepEqual(parseArgv(p, ['foo']), { symbol: 'foo' });
  assert.deepEqual(parseArgv(p, ['foo', '3']), { symbol: 'foo', depth: 3 });
  assert.deepEqual(argvFor(p, { symbol: 'foo', depth: 3 }), ['foo', '3']);
  assert.deepEqual(argvFor(p, { symbol: 'foo' }), ['foo']);
});

test('parseArgv/argvFor: flag booleana', () => {
  const p = [
    { name: 'domain', kind: 'positional' },
    { name: 'code', kind: 'flag' },
  ];
  assert.deepEqual(parseArgv(p, ['orders', '--code']), { domain: 'orders', code: true });
  assert.deepEqual(argvFor(p, { domain: 'orders', code: true }), ['orders', '--code']);
  assert.deepEqual(argvFor(p, { domain: 'orders' }), ['orders']);
});

test('parseArgv/argvFor: flag-value', () => {
  const p = [
    { name: 'objective', kind: 'positional', required: true },
    { name: 'ref', kind: 'flag-value', flag: '--ref' },
    { name: 'role', kind: 'flag-value', flag: '--role' },
  ];
  assert.deepEqual(parseArgv(p, ['auth', '--ref', 'HEAD', '--role', 'worker']), { objective: 'auth', ref: 'HEAD', role: 'worker' });
  assert.deepEqual(argvFor(p, { objective: 'auth', ref: 'HEAD', role: 'worker' }), ['auth', '--ref', 'HEAD', '--role', 'worker']);
});

test('parseArgv/argvFor: rest', () => {
  const p = [
    { name: 'phase', kind: 'positional', required: true },
    { name: 'slug', kind: 'positional', required: true },
    { name: 'context', kind: 'rest' },
  ];
  assert.deepEqual(parseArgv(p, ['plan', 'pix', 'nota', 'de', 'contexto']), { phase: 'plan', slug: 'pix', context: 'nota de contexto' });
  assert.deepEqual(argvFor(p, { phase: 'plan', slug: 'pix', context: 'nota de contexto' }), ['plan', 'pix', 'nota', 'de', 'contexto']);
});

test('makeValidator: required ausente e tipo errado', () => {
  const v = makeValidator([
    { name: 'slug', kind: 'positional', required: true },
    { name: 'depth', kind: 'positional', parse: 'int' },
  ]);
  assert.throws(() => v({}), /obrigatório/);
  assert.throws(() => v({ slug: 'x', depth: 'nan' }), /número/);
  assert.deepEqual(v({ slug: 'x', depth: 2 }), { slug: 'x', depth: 2 });
});

// --- round-trip: todo spec da cobertura -------------------------------------

// argv de exemplo por comando (válido). Cobre o AC-3.
const ARGV_FIXTURE = {
  'tools:doctor': [],
  'code:impact': ['MyClass', '3'],
  'context:budget': ['.context/pack.md', '5000'],
  'spec:check': ['pagamentos-pix'],
  'sprint:status': ['MeuProjeto'],
  'gsd:handoff': ['plan', 'pagamentos-pix', 'contexto', 'com', 'espacos'],
  'spec:new': ['pagamentos-pix'],
  'spec:plan': ['pagamentos-pix'],
  'spec:tasks': ['pagamentos-pix'],
  'code:context': ['orders', 'refund', '--code', '--full', '--project', '/tmp/p'],
  'query:universal': ['handoff 7 campos'],
  'engineer': ['adicionar rate limit', '--ref', 'HEAD', '--role', 'worker'],
  'risk:assess': ['HEAD~1'],
  'orchestrate:status': ['pagamentos-pix'],
  'orchestrate:advance': ['pagamentos-pix'],
  'drift:check': ['--domain', 'pagamentos'],
  'status': [],
  'next': [],
};

for (const spec of CLI_CAPABILITY_SPECS) {
  test(`round-trip: ${spec.command}`, () => {
    const argv = ARGV_FIXTURE[spec.command];
    assert.ok(argv !== undefined, `sem fixture de argv para ${spec.command} — adicione em ARGV_FIXTURE`);
    const roundtrip = argvFor(spec.params, parseArgv(spec.params, argv));
    assert.deepEqual(roundtrip, argv);
  });
}

// --- o help não pode prometer flag que o roteador joga fora -------------------

/**
 * Um comando-capability não recebe o argv do usuário: o roteador o parseia contra `params`, e
 * `argvFor` reconstrói. Flag não declarada é descartada em silêncio — `forja code:context x --full`
 * rodando como se não tivesse pedido nada (achado da SPEC-057, visto no smoke, não na suíte).
 * `--json` fica de fora: o roteador trata dele antes, e ele é o contrato, não um parâmetro.
 */
test('toda flag anunciada no usage de um comando-capability está declarada nos params', () => {
  const violacoes = [];
  for (const spec of CLI_CAPABILITY_SPECS) {
    const usage = COMMANDS[spec.command]?.usage;
    if (!usage) continue;
    const declaradas = new Set(
      spec.params.map((p) => (p.kind === 'flag-value' ? p.flag : p.kind === 'flag' ? `--${p.name}` : null)).filter(Boolean),
    );
    for (const flag of usage.match(/--[a-z][a-z0-9-]*/g) ?? []) {
      if (flag === '--json' || declaradas.has(flag)) continue;
      violacoes.push(`${spec.command}: ${flag}`);
    }
  }
  assert.deepEqual(violacoes, [], `usage anuncia flag que o roteador descarta:\n  ${violacoes.join('\n  ')}`);
});
