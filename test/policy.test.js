import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApprovalLedger, PolicyEngine, PolicyError } from '../packages/policy/src/index.ts';

const now = '2026-07-31T00:00:00.000Z';
const agent = { id: 'agent-1', name: 'developer', role: 'developer', autonomy: 'supervised' };
const definition = {
  schemaVersion: '2.0', createdAt: now, updatedAt: now, correlationId: 'test', id: 'workspace.write', version: '1.0.0',
  description: 'Write workspace', permissions: ['write'], risk: 'high', sideEffects: ['filesystem'], requirements: [],
  supportsAutonomy: false, idempotent: false, timeoutMs: 1000, retry: { maxAttempts: 1, backoffMs: 0 }, aliases: [],
};

function request(overrides = {}) {
  return { definition, agent, projectId: 'forja', environment: 'local', categories: ['write'], files: ['src/a.ts'], now, ...overrides };
}

test('policy: default deny quando nenhuma regra casa', () => {
  const result = new PolicyEngine().authorize(request());
  assert.equal(result.effect, 'DENY');
  assert.equal(result.policyId, 'default-deny');
});

test('policy: regra allow with limits retorna limites estruturados', () => {
  const result = new PolicyEngine({ rules: [{ id: 'developer-write', priority: 10, effect: 'ALLOW_WITH_LIMITS', reason: 'bounded', scope: { roles: ['developer'] }, limits: { maxFiles: 2, maxTokens: 500 } }] }).authorize(request());
  assert.equal(result.effect, 'ALLOW_WITH_LIMITS');
  assert.deepEqual(result.limits, { maxFiles: 2, maxTokens: 500 });
});

// SPEC-029, AC-1: maxCostUsd é só mais um campo de PolicyLimits — asNumericLimits itera
// Object.entries genericamente, então uma regra que o declara já flui para PolicyDecision.limits
// sem qualquer mudança em PolicyEngine.
test('policy: maxCostUsd flui de PolicyLimits para PolicyDecision.limits como qualquer outro limite', () => {
  const result = new PolicyEngine({ rules: [{ id: 'developer-cost', priority: 10, effect: 'ALLOW_WITH_LIMITS', reason: 'bounded cost', scope: { roles: ['developer'] }, limits: { maxCostUsd: 2.5 } }] }).authorize(request());
  assert.equal(result.effect, 'ALLOW_WITH_LIMITS');
  assert.deepEqual(result.limits, { maxCostUsd: 2.5 });
});

test('policy: risco crítico exige aprovação mesmo com allow', () => {
  const critical = { ...definition, id: 'deployment.release', risk: 'critical' };
  const result = new PolicyEngine({ rules: [{ id: 'release', priority: 10, effect: 'ALLOW', reason: 'release window', scope: {} }] }).authorize(request({ definition: critical, categories: ['deployment'] }));
  assert.equal(result.effect, 'REQUIRE_APPROVAL');
  assert.equal(result.approvalRequestId, undefined);
});

test('policy: risco crítico com ALLOW_WITH_LIMITS também exige aprovação', () => {
  const critical = { ...definition, id: 'deployment.release', risk: 'critical' };
  const result = new PolicyEngine({ rules: [{ id: 'release', priority: 10, effect: 'ALLOW_WITH_LIMITS', reason: 'release window', scope: {}, limits: { maxFiles: 1 } }] }).authorize(request({ definition: critical, categories: ['deployment'] }));
  assert.equal(result.effect, 'REQUIRE_APPROVAL');
});

test('policy: authorize resolve para ALLOW no retry após aprovação, usando o mesmo correlationId', () => {
  const ledger = new ApprovalLedger();
  const engine = new PolicyEngine({ approvalLedger: ledger, rules: [{ id: 'write-approval', priority: 1, effect: 'REQUIRE_APPROVAL', reason: 'review', scope: {} }] });
  const approval = { action: 'write', justification: 'task', impact: 'source change', expectedDiff: 'src/a.ts', expiresAt: '2099-01-01T00:00:00.000Z' };
  const first = engine.authorize(request({ correlationId: 'run-1', approval }));
  assert.equal(first.effect, 'REQUIRE_APPROVAL');
  // Retrying before a decision exists must not mint a second pending request for the same run.
  const retryBeforeDecision = engine.authorize(request({ correlationId: 'run-1', approval }));
  assert.equal(retryBeforeDecision.approvalRequestId, first.approvalRequestId);
  assert.equal(ledger.list().length, 1);
  ledger.decide(first.approvalRequestId, { decision: 'approved', approverId: 'reviewer-1', decidedAt: '2026-07-31T01:00:00.000Z' });
  const resumed = engine.authorize(request({ correlationId: 'run-1', approval }));
  assert.equal(resumed.effect, 'ALLOW');
});

test('policy: authorize resolve para DENY após rejeição, usando o mesmo correlationId', () => {
  const ledger = new ApprovalLedger();
  const engine = new PolicyEngine({ approvalLedger: ledger, rules: [{ id: 'write-approval', priority: 1, effect: 'REQUIRE_APPROVAL', reason: 'review', scope: {} }] });
  const approval = { action: 'write', justification: 'task', impact: 'source change', expiresAt: '2099-01-01T00:00:00.000Z' };
  const first = engine.authorize(request({ correlationId: 'run-2', approval }));
  ledger.decide(first.approvalRequestId, { decision: 'rejected', approverId: 'reviewer-1', decidedAt: '2026-07-31T01:00:00.000Z' });
  const resumed = engine.authorize(request({ correlationId: 'run-2', approval }));
  assert.equal(resumed.effect, 'DENY');
});

test('policy: aprovação cria request auditável e ledger decide', () => {
  const ledger = new ApprovalLedger();
  const engine = new PolicyEngine({ approvalLedger: ledger, rules: [{ id: 'write-approval', priority: 1, effect: 'REQUIRE_APPROVAL', reason: 'review', scope: {} }] });
  const result = engine.authorize(request({ approval: { action: 'write', justification: 'task', impact: 'source change', expectedDiff: 'src/a.ts', expiresAt: '2026-08-01T00:00:00.000Z' } }));
  assert.equal(result.effect, 'REQUIRE_APPROVAL');
  const created = ledger.get(result.approvalRequestId);
  assert.equal(created.decision, undefined);
  const decided = ledger.decide(created.id, { decision: 'approved', approverId: 'reviewer-1', decidedAt: '2026-07-31T01:00:00.000Z' });
  assert.equal(decided.decision, 'approved');
});

test('policy: rejeita regra duplicada e empate prioriza deny', () => {
  assert.throws(() => new PolicyEngine({ rules: [{ id: 'same', priority: 1, effect: 'ALLOW', reason: 'a', scope: {} }, { id: 'same', priority: 1, effect: 'DENY', reason: 'b', scope: {} }] }), PolicyError);
  const result = new PolicyEngine({ rules: [{ id: 'allow', priority: 1, effect: 'ALLOW', reason: 'a', scope: {} }, { id: 'deny', priority: 1, effect: 'DENY', reason: 'b', scope: {} }] }).authorize(request());
  assert.equal(result.effect, 'DENY');
});

test('policy: ledger recupera approval persistido após recriação', () => {
  const values = new Map();
  const store = { save: (value) => values.set(value.id, value), get: (id) => values.get(id), list: () => [...values.values()] };
  const first = new ApprovalLedger(store);
  const created = first.create({ action: 'write', justification: 'test', impact: 'source', expiresAt: '2099-01-01T00:00:00.000Z', correlationId: 'persisted' });
  const second = new ApprovalLedger(store);
  assert.equal(second.get(created.id).action, 'write');
  assert.equal(second.list().length, 1);
  assert.equal(second.decide(created.id, { decision: 'approved', approverId: 'reviewer-1', decidedAt: '2026-08-01T00:00:00.000Z' }).decision, 'approved');
});

const approvalDetails = { action: 'write', justification: 'task', impact: 'source change', expectedDiff: 'src/a.ts', expiresAt: '2026-08-01T00:00:00.000Z' };
const approvalRule = { id: 'write-approval', priority: 1, effect: 'REQUIRE_APPROVAL', reason: 'review', scope: {}, limits: { maxFiles: 2, maxTokens: 500, maxDurationMs: 1000, maxRetries: 1, maxCostUsd: 2 } };

function boundRequest(overrides = {}) {
  return request({
    operationId: 'run-1:step-0', correlationId: 'run-1', approval: { ...approvalDetails },
    input: { capabilityId: definition.id, payload: { path: 'src/a.ts', contents: ['a', 'b'], optional: undefined } },
    budget: { inputTokens: 100, outputTokens: 200, totalTokens: 300, usedTokens: 0 },
    ...overrides,
  });
}

function approvalEngine(ledger = new ApprovalLedger(), rule = approvalRule) {
  return new PolicyEngine({ approvalLedger: ledger, rules: [rule] });
}

function approve(ledger, id) {
  return ledger.decide(id, { decision: 'approved', approverId: 'reviewer-1', decidedAt: now });
}

const changedDimensions = [
  ['payload', (r) => { r.input.payload.path = 'src/b.ts'; }],
  ['capability', (r) => { r.definition = { ...r.definition, id: 'workspace.delete' }; r.input.capabilityId = r.definition.id; }],
  ['version', (r) => { r.definition = { ...r.definition, version: '2.0.0' }; }],
  ['risk', (r) => { r.definition = { ...r.definition, risk: 'critical' }; }],
  ['permissions', (r) => { r.definition = { ...r.definition, permissions: ['write', 'delete'] }; }],
  ['sideEffects', (r) => { r.definition = { ...r.definition, sideEffects: ['network'] }; }],
  ['agent id', (r) => { r.agent = { ...r.agent, id: 'agent-2' }; }],
  ['agent role', (r) => { r.agent = { ...r.agent, role: 'admin' }; }],
  ['agent autonomy', (r) => { r.agent = { ...r.agent, autonomy: 'controlled_autonomous' }; }],
  ['project', (r) => { r.projectId = 'other'; }],
  ['environment', (r) => { r.environment = 'production'; }],
  ['files', (r) => { r.files = ['src/b.ts']; }],
  ['categories', (r) => { r.categories = ['deployment']; }],
  ['step', (r) => { r.operationId = 'run-1:step-1'; }],
  ...['action', 'justification', 'impact', 'expectedDiff'].map((key) => [key, (r) => { r.approval[key] = 'changed'; }]),
  ['expiresAt', (r) => { r.approval.expiresAt = '2026-08-02T00:00:00.000Z'; }],
  ['policy id', (_r, rule) => { rule.id = 'other-policy'; }],
  ['policy reason', (_r, rule) => { rule.reason = 'other review'; }],
  ['policy scope', (_r, rule) => { rule.scope = { environments: ['local'] }; }],
  ['policy priority', (_r, rule) => { rule.priority = 2; }],
  ['policy effect', (_r, rule) => { rule.effect = 'ALLOW_WITH_LIMITS'; }],
  ...['maxFiles', 'maxTokens', 'maxDurationMs', 'maxRetries', 'maxCostUsd'].map((key) => [`limit ${key}`, (_r, rule) => { rule.limits[key] += 1; }]),
  ...['inputTokens', 'outputTokens', 'totalTokens'].map((key) => [`budget ${key}`, (r) => { r.budget[key] += 1; }]),
];

for (const [dimension, change] of changedDimensions) {
  test(`policy: mudança de ${dimension} exige outra aprovação`, () => {
    const ledger = new ApprovalLedger();
    // Critical risk keeps both REQUIRE_APPROVAL and granting rules behind the approval gate.
    const original = boundRequest({ definition: { ...definition, risk: 'critical' } });
    if (dimension === 'risk') original.definition = definition;
    const first = approvalEngine(ledger).authorize(original);
    approve(ledger, first.approvalRequestId);
    const changed = structuredClone(original);
    const rule = structuredClone(approvalRule);
    change(changed, rule);
    const result = approvalEngine(ledger, rule).authorize(changed);
    assert.equal(result.effect, 'REQUIRE_APPROVAL');
    assert.notEqual(result.approvalRequestId, first.approvalRequestId);
    assert.equal(ledger.list().length, 2);
  });
}

test('policy: operação exata deduplica pending e retoma approved após reabrir ledger', () => {
  const values = new Map();
  const store = { save: (value) => values.set(value.id, structuredClone(value)), get: (id) => values.get(id), list: () => [...values.values()] };
  const ledger = new ApprovalLedger(store);
  const engine = approvalEngine(ledger);
  const original = boundRequest();
  const first = engine.authorize(original);
  assert.equal(engine.authorize(original).approvalRequestId, first.approvalRequestId);
  const saved = ledger.get(first.approvalRequestId);
  assert.equal(saved.operationId, original.operationId);
  assert.match(saved.fingerprint, /^v1:[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(saved, 'input'), false);
  assert.equal(Object.hasOwn(saved, 'payload'), false);
  assert.equal(JSON.stringify(saved).includes('contents'), false);
  approve(new ApprovalLedger(store), first.approvalRequestId);
  const result = approvalEngine(new ApprovalLedger(store)).authorize(original);
  assert.equal(result.effect, 'ALLOW_WITH_LIMITS');
  assert.deepEqual(result.limits, approvalRule.limits);
  assert.equal(result.approvalRequestId, first.approvalRequestId);
  assert.equal(ledger.list().length, 1);
});

test('policy: chaves e conjuntos reordenados, consumo e auditoria não mudam fingerprint', () => {
  const ledger = new ApprovalLedger();
  const engine = approvalEngine(ledger);
  const original = boundRequest({ files: ['src/a.ts', 'src/b.ts'], categories: ['write', 'read'] });
  const first = engine.authorize(original);
  const equivalent = boundRequest({
    correlationId: 'different-audit-correlation', now: '2026-07-31T02:00:00.000Z',
    files: ['src/b.ts', 'src/a.ts', 'src/a.ts'], categories: ['read', 'write', 'write'],
    definition: { ...definition, createdAt: '2026-07-30T00:00:00.000Z', updatedAt: '2026-07-31T01:00:00.000Z', correlationId: 'other' },
    input: { capabilityId: definition.id, payload: { optional: undefined, contents: ['a', 'b'], path: 'src/a.ts' } },
    budget: { usedTokens: 42, totalTokens: 300, outputTokens: 200, inputTokens: 100 },
  });
  assert.equal(engine.authorize(equivalent).approvalRequestId, first.approvalRequestId);
  approve(ledger, first.approvalRequestId);
  assert.equal(engine.authorize(equivalent).effect, 'ALLOW_WITH_LIMITS');
  assert.equal(ledger.list().length, 1);
});

for (const [name, payload] of [
  ['arrays reordenados', { path: 'src/a.ts', contents: ['b', 'a'], optional: undefined }],
  ['undefined versus ausente', { path: 'src/a.ts', contents: ['a', 'b'] }],
  ['undefined versus null', { path: 'src/a.ts', contents: ['a', 'b'], optional: null }],
  ['undefined versus marcador textual', { path: 'src/a.ts', contents: ['a', 'b'], optional: 'undefined' }],
]) {
  test(`policy: ${name} não colidem`, () => {
    const ledger = new ApprovalLedger();
    const engine = approvalEngine(ledger);
    const first = engine.authorize(boundRequest());
    approve(ledger, first.approvalRequestId);
    const result = engine.authorize(boundRequest({ input: { capabilityId: definition.id, payload } }));
    assert.equal(result.effect, 'REQUIRE_APPROVAL');
    assert.notEqual(result.approvalRequestId, first.approvalRequestId);
  });
}

test('policy: rejected só nega a operação exata', () => {
  const ledger = new ApprovalLedger();
  const engine = approvalEngine(ledger);
  const first = engine.authorize(boundRequest());
  ledger.decide(first.approvalRequestId, { decision: 'rejected', approverId: 'reviewer', decidedAt: now });
  assert.equal(engine.authorize(boundRequest()).effect, 'DENY');
  assert.equal(engine.authorize(boundRequest({ operationId: 'run-1:step-1' })).effect, 'REQUIRE_APPROVAL');
});

test('policy: sem operação nem correlação não reutiliza agente como identidade', () => {
  const ledger = new ApprovalLedger();
  const engine = approvalEngine(ledger);
  const unbound = boundRequest({ operationId: undefined, correlationId: undefined });
  const first = engine.authorize(unbound);
  const second = engine.authorize(unbound);
  assert.notEqual(first.approvalRequestId, second.approvalRequestId);
  assert.notEqual(ledger.get(first.approvalRequestId).operationId, agent.id);
  approve(ledger, second.approvalRequestId);
  assert.equal(engine.authorize(unbound).effect, 'REQUIRE_APPROVAL');
});

test('policy: aprovação descritiva histórica sem vínculo nunca autoriza capability', () => {
  const ledger = new ApprovalLedger();
  const historical = ledger.create({ ...approvalDetails, correlationId: 'run-1' }, now);
  approve(ledger, historical.id);
  const result = approvalEngine(ledger).authorize(boundRequest({ operationId: undefined }));
  assert.equal(result.effect, 'REQUIRE_APPROVAL');
  assert.notEqual(result.approvalRequestId, historical.id);
});

for (const state of ['pending', 'approved']) {
  for (const at of ['2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.001Z']) {
    test(`policy: ${state} não autoriza em/depois do vencimento ${at}`, () => {
      const ledger = new ApprovalLedger();
      const engine = approvalEngine(ledger);
      const first = engine.authorize(boundRequest());
      if (state === 'approved') approve(ledger, first.approvalRequestId);
      assert.throws(() => engine.authorize(boundRequest({ now: at })), PolicyError);
      const fresh = engine.authorize(boundRequest({ now: at, approval: { ...approvalDetails, expiresAt: '2026-08-02T00:00:00.000Z' } }));
      assert.equal(fresh.effect, 'REQUIRE_APPROVAL');
      assert.notEqual(fresh.approvalRequestId, first.approvalRequestId);
    });
  }
}

test('policy: aprovado autoriza um milissegundo antes do vencimento', () => {
  const ledger = new ApprovalLedger();
  const engine = approvalEngine(ledger);
  const first = engine.authorize(boundRequest());
  approve(ledger, first.approvalRequestId);
  assert.equal(engine.authorize(boundRequest({ now: '2026-07-31T23:59:59.999Z' })).effect, 'ALLOW_WITH_LIMITS');
});

for (const invalid of ['not-a-date', '2026-02-30T00:00:00.000Z', '2026-08-01', '2026-08-01T00:00:00', '2026-08-01T24:00:00Z']) {
  test(`policy: datas inválidas ou ambíguas falham fechado (${invalid})`, () => {
    const ledger = new ApprovalLedger();
    assert.throws(() => ledger.create({ ...approvalDetails, expiresAt: invalid, correlationId: 'date' }, now), PolicyError);
    assert.throws(() => ledger.create({ ...approvalDetails, correlationId: 'date' }, invalid), PolicyError);
    const created = ledger.create({ ...approvalDetails, correlationId: 'date' }, now);
    assert.throws(() => ledger.decide(created.id, { decision: 'approved', approverId: 'reviewer', decidedAt: invalid }), PolicyError);
    assert.throws(() => ledger.expire(invalid), PolicyError);
    assert.throws(() => approvalEngine(ledger).authorize(boundRequest({ now: invalid })), PolicyError);
  });
}

test('policy: datas com offsets são comparadas por instante, incluindo boundary', () => {
  const ledger = new ApprovalLedger();
  const expiresAt = '2026-07-31T01:00:00+01:00';
  assert.throws(() => ledger.create({ ...approvalDetails, expiresAt, correlationId: 'date' }, now), PolicyError);
  const created = ledger.create({ ...approvalDetails, expiresAt, correlationId: 'date' }, '2026-07-30T23:59:59.999Z');
  assert.throws(() => ledger.decide(created.id, { decision: 'approved', approverId: 'reviewer', decidedAt: now }), PolicyError);
  assert.equal(ledger.expire(now)[0].decision, 'expired');
});

test('policy: get e expire observam store, inclusive aprovações carregadas por outro ledger', () => {
  const values = new Map();
  const store = { save: (value) => values.set(value.id, structuredClone(value)), get: (id) => values.get(id), list: () => [...values.values()] };
  const firstLedger = new ApprovalLedger(store);
  const engine = approvalEngine(firstLedger);
  const first = engine.authorize(boundRequest());
  const pending = engine.authorize(boundRequest({ operationId: 'run-1:step-1' }));
  const secondLedger = new ApprovalLedger(store);
  approve(secondLedger, first.approvalRequestId);
  assert.equal(firstLedger.get(first.approvalRequestId).decision, 'approved');
  assert.throws(() => approve(firstLedger, first.approvalRequestId), PolicyError);
  const expired = new ApprovalLedger(store).expire(approvalDetails.expiresAt);
  assert.deepEqual(new Set(expired.map((value) => value.id)), new Set([first.approvalRequestId, pending.approvalRequestId]));
  assert.equal(firstLedger.get(first.approvalRequestId).decision, 'expired');
  // Even a still-future request explicitly expired in persistence must not grant from cache.
  const fresh = engine.authorize(boundRequest());
  assert.equal(fresh.effect, 'REQUIRE_APPROVAL');
  assert.notEqual(fresh.approvalRequestId, first.approvalRequestId);
  values.delete(fresh.approvalRequestId);
  assert.throws(() => firstLedger.get(fresh.approvalRequestId), PolicyError);
});

const cyclicPayload = {};
cyclicPayload.self = cyclicPayload;
const invalidPayloads = [
  ['cycle', cyclicPayload], ['NaN', NaN], ['Infinity', Infinity], ['-Infinity', -Infinity],
  ['bigint', 1n], ['function', () => {}], ['symbol', Symbol('payload')], ['Date', new Date(now)],
  ['Map', new Map()], ['Set', new Set()], ['class', new (class Payload { value = 1; })()],
  ['sparse array', new Array(1)], ['array property', Object.assign([1], { extra: 2 })],
  ['accessor', { get value() { return 1; } }], ['symbol key', { [Symbol('key')]: 1 }],
  ['hidden property', Object.defineProperty({}, 'hidden', { value: 1 })],
];
for (const [name, payload] of invalidPayloads) {
  test(`policy: payload não canônico (${name}) falha fechado ao pedir aprovação`, () => {
    const ledger = new ApprovalLedger();
    const engine = approvalEngine(ledger);
    const first = engine.authorize(boundRequest());
    approve(ledger, first.approvalRequestId);
    assert.throws(() => engine.authorize(boundRequest({ input: { capabilityId: definition.id, payload } })), PolicyError);
    assert.equal(ledger.list().length, 1);
  });
}

// SPEC-034 AC-5: riskScoreRange é um número puro em PolicyScope/PolicyRequest — policy nunca
// importa @forja/engineering-risk, só casa a faixa contra o número que o caller já calculou.
test('policy: riskScoreRange casa regra por faixa de score de risco', () => {
  const rules = [{ id: 'high-risk-review', priority: 10, effect: 'REQUIRE_APPROVAL', reason: 'score alto', scope: { riskScoreRange: [51, 100] } }];
  const engine = new PolicyEngine({ rules });
  const highRisk = engine.authorize(request({ riskScore: 80 }));
  assert.equal(highRisk.effect, 'REQUIRE_APPROVAL');
  assert.equal(highRisk.policyId, 'high-risk-review');
});

test('policy: riskScoreRange não casa fora da faixa (cai para default-deny)', () => {
  const rules = [{ id: 'high-risk-review', priority: 10, effect: 'REQUIRE_APPROVAL', reason: 'score alto', scope: { riskScoreRange: [51, 100] } }];
  const engine = new PolicyEngine({ rules });
  const lowRisk = engine.authorize(request({ riskScore: 20 }));
  assert.equal(lowRisk.effect, 'DENY');
  assert.equal(lowRisk.policyId, 'default-deny');
});

test('policy: riskScoreRange não casa quando riskScore está ausente da request', () => {
  const rules = [{ id: 'high-risk-review', priority: 10, effect: 'REQUIRE_APPROVAL', reason: 'score alto', scope: { riskScoreRange: [51, 100] } }];
  const engine = new PolicyEngine({ rules });
  const noScore = engine.authorize(request());
  assert.equal(noScore.effect, 'DENY');
  assert.equal(noScore.policyId, 'default-deny');
});

test('policy: regra sem riskScoreRange continua casando normalmente, riskScore presente ou não', () => {
  const rules = [{ id: 'developer-write', priority: 10, effect: 'ALLOW', reason: 'sem restrição de score', scope: { roles: ['developer'] } }];
  const engine = new PolicyEngine({ rules });
  assert.equal(engine.authorize(request()).effect, 'ALLOW');
  assert.equal(engine.authorize(request({ riskScore: 99 })).effect, 'ALLOW');
});

// SPEC-040 AC-4: anomalyScoreRange segue exatamente o mesmo padrão de riskScoreRange.
test('policy: anomalyScoreRange casa regra por faixa de score de anomalia', () => {
  const rules = [{ id: 'high-anomaly-review', priority: 10, effect: 'REQUIRE_APPROVAL', reason: 'anomalia alta', scope: { anomalyScoreRange: [51, 100] } }];
  const engine = new PolicyEngine({ rules });
  const highAnomaly = engine.authorize(request({ anomalyScore: 80 }));
  assert.equal(highAnomaly.effect, 'REQUIRE_APPROVAL');
  assert.equal(highAnomaly.policyId, 'high-anomaly-review');
});

test('policy: anomalyScoreRange não casa fora da faixa nem quando anomalyScore está ausente', () => {
  const rules = [{ id: 'high-anomaly-review', priority: 10, effect: 'REQUIRE_APPROVAL', reason: 'anomalia alta', scope: { anomalyScoreRange: [51, 100] } }];
  const engine = new PolicyEngine({ rules });
  assert.equal(engine.authorize(request({ anomalyScore: 20 })).effect, 'DENY');
  assert.equal(engine.authorize(request()).effect, 'DENY');
});

test('policy: riskScoreRange e anomalyScoreRange podem ser combinados na mesma regra (ambos precisam casar)', () => {
  const rules = [{ id: 'high-risk-and-anomaly', priority: 10, effect: 'DENY', reason: 'risco e anomalia altos', scope: { riskScoreRange: [51, 100], anomalyScoreRange: [51, 100] } }];
  const engine = new PolicyEngine({ rules });
  assert.equal(engine.authorize(request({ riskScore: 80, anomalyScore: 20 })).effect, 'DENY', 'sem regra casando, default-deny — mas policyId confirma qual caminho');
  assert.equal(engine.authorize(request({ riskScore: 80, anomalyScore: 20 })).policyId, 'default-deny', 'anomalyScore fora da faixa não casa a regra específica, cai no default');
  assert.equal(engine.authorize(request({ riskScore: 80, anomalyScore: 80 })).policyId, 'high-risk-and-anomaly');
});
