import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeterministicPlanner, PlannerError } from '../packages/planner/src/index.ts';
import { DeterministicValidator } from '../packages/validator/src/index.ts';

const budget = { inputTokens: 90, outputTokens: 30, totalTokens: 120, usedTokens: 0 };
const evidence = ['evidence-1'];
const base = { objective: 'Implement parser', acceptanceCriteria: ['parser accepts valid input'], allowedFiles: ['src/parser.ts'], evidenceIds: evidence, contextEvidenceIds: ['context-1'], graphDependencyIds: ['graph-1'], budget, correlationId: 'planner-test' };

test('planner: produz plano determinístico com dependências, risco e orçamento', () => {
  const plan = new DeterministicPlanner().plan(base);
  assert.equal(plan.steps.length, 3);
  assert.equal(plan.steps[1].dependencyIds.includes('graph-1'), true);
  assert.equal(plan.risk, 'low');
  assert.equal(plan.budget.totalTokens, 120);
  assert.equal(plan.steps.reduce((sum, step) => sum + step.budget.totalTokens, 0), 120);
  assert.deepEqual(plan.evidenceIds.sort(), ['context-1', 'evidence-1']);
});

test('planner: exige objetivo, critérios e evidência', () => {
  const planner = new DeterministicPlanner();
  assert.throws(() => planner.plan({ ...base, objective: '', evidenceIds: [] }), PlannerError);
  assert.throws(() => planner.plan({ ...base, acceptanceCriteria: [] }), PlannerError);
  assert.throws(() => planner.plan({ ...base, evidenceIds: [], contextEvidenceIds: [] }), PlannerError);
});

function plan() {
  return new DeterministicPlanner().plan(base);
}

const checks = [
  { name: 'build', passed: true, evidenceIds: ['build-e'] },
  { name: 'tests', passed: true, evidenceIds: ['test-e'] },
  { name: 'lint', passed: true, evidenceIds: ['lint-e'] },
  { name: 'typecheck', passed: true, evidenceIds: ['type-e'] },
];
const acceptance = [{ criterion: 'parser accepts valid input', passed: true, evidenceIds: ['accept-e'] }, ...plan().steps[0].acceptanceCriteria.map((criterion) => ({ criterion, passed: true, evidenceIds: ['scope-e'] })), ...plan().steps[2].acceptanceCriteria.map((criterion) => ({ criterion, passed: true, evidenceIds: ['validate-e'] }))];

test('validator: aceita somente com checks, critérios e evidências', () => {
  const result = new DeterministicValidator().validate({ plan: plan(), changedFiles: ['src/parser.ts'], checks, acceptance, correlationId: 'validator-test' });
  assert.equal(result.status, 'accepted');
  assert.equal(result.checks.some((check) => check.name === 'scope' && check.passed), true);
  assert.match(result.summary, /accepted/);
});

test('validator: impede falsa conclusão por check ausente, escopo e contradição', () => {
  const result = new DeterministicValidator().validate({ plan: plan(), changedFiles: ['src/parser.ts', 'src/secret.ts'], checks: checks.slice(0, 2), acceptance, contradictions: [{ id: 'contradiction-1', claimIds: ['a', 'b'], reason: 'conflict', evidenceIds: ['contradiction-e'] }] });
  assert.equal(result.status, 'rejected');
  assert.equal(result.checks.find((check) => check.name === 'scope').passed, false);
  assert.equal(result.checks.find((check) => check.name === 'contradictions').passed, false);
});

test('validator: retorna inconclusive quando falta evidência de critério', () => {
  const incomplete = acceptance.filter((item) => item.criterion !== 'parser accepts valid input');
  const result = new DeterministicValidator().validate({ plan: plan(), changedFiles: ['src/parser.ts'], checks, acceptance: incomplete });
  assert.equal(result.status, 'inconclusive');
});

test('validator: bloqueia quando há blocker explícito ou achado de segurança grave', () => {
  const blocked = new DeterministicValidator().validate({ plan: plan(), changedFiles: ['src/parser.ts'], checks, acceptance, blockers: ['approval pending'] });
  assert.equal(blocked.status, 'blocked');
  const rejected = new DeterministicValidator().validate({ plan: plan(), changedFiles: ['src/parser.ts'], checks, acceptance, securityFindings: [{ id: 'finding-1', severity: 'high', message: 'unsafe', evidenceIds: ['security-e'] }] });
  assert.equal(rejected.status, 'rejected');
});
