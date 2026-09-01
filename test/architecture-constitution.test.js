import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkConstitution, compileConstitution, explainRule, parseConstraintLine } from '../packages/engineering/architecture/src/index.ts';

test('parseConstraintLine: reconhece os 3 padrões com confidence 1', () => {
  const forbidImport = parseConstraintLine('- packages/policy não depende de better-sqlite3');
  assert.equal(forbidImport?.constraint.kind, 'forbid_import');
  assert.equal(forbidImport?.constraint.target, 'better-sqlite3');
  assert.equal(forbidImport?.confidence, 1);

  const forbidDependency = parseConstraintLine('- Controllers não acessam Repository diretamente');
  assert.equal(forbidDependency?.constraint.kind, 'forbid_dependency');
  assert.equal(forbidDependency?.confidence, 1);

  const requireDependency = parseConstraintLine('- packages/billing usa PaymentGateway');
  assert.equal(requireDependency?.constraint.kind, 'require_dependency');
  assert.equal(requireDependency?.constraint.target, 'PaymentGateway');
  assert.equal(requireDependency?.confidence, 1);
});

test('parseConstraintLine: frase fora do vocabulário fica proposed, nunca confidence 1', () => {
  const ambiguous = parseConstraintLine('- o time deveria conversar mais sobre isso');
  assert.ok(ambiguous !== undefined, 'ainda retorna algo, para não descartar silenciosamente');
  assert.ok(ambiguous.confidence < 1, 'frase fora do vocabulário nunca vira active');
});

test('compileConstitution: só ADR com ## Constraints produz regra; frase reconhecida vira active', () => {
  const withConstraints = { source: 'memory/90-decisions/0078-exemplo.md', content: '# ADR-0078\n\n## Decision\n\nblá.\n\n## Constraints\n\n- packages/policy não depende de better-sqlite3\n\n## Consequences\n' };
  const withoutConstraints = { source: 'memory/90-decisions/0001-outra.md', content: '# ADR-0001\n\n## Decision\n\nblá.\n' };
  const rules = compileConstitution([withConstraints, withoutConstraints]);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].status, 'active');
  assert.equal(rules[0].source, 'memory/90-decisions/0078-exemplo.md');
  assert.equal(rules[0].scope.paths[0], 'packages/policy/**');
});

test('compileConstitution: frase ambígua compila como proposed, não trava a compilação', () => {
  const adr = { source: 'memory/90-decisions/0002-ambigua.md', content: '## Constraints\n\n- deveríamos ser mais cuidadosos\n' };
  const rules = compileConstitution([adr]);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].status, 'proposed');
});

test('checkConstitution: detecta violação injetada e reporta linha de base limpa como compliant', () => {
  const rule = compileConstitution([{ source: 'memory/90-decisions/0078-exemplo.md', content: '## Constraints\n\n- packages/policy não depende de better-sqlite3\n' }]);
  const clean = checkConstitution(rule, [{ fromPath: 'packages/policy/src/index.ts', targetLabel: '../../contracts/src/index.ts' }]);
  assert.equal(clean.violations.length, 0);
  assert.equal(clean.compliant, 1);

  const violating = checkConstitution(rule, [{ fromPath: 'packages/policy/src/index.ts', targetLabel: 'better-sqlite3' }]);
  assert.equal(violating.violations.length, 1);
  assert.equal(violating.violations[0].ruleId, rule[0].id);
  assert.equal(violating.violations[0].file, 'packages/policy/src/index.ts');
});

test('checkConstitution: regra proposed nunca é aplicada (só active bloqueia)', () => {
  const rules = compileConstitution([{ source: 'x.md', content: '## Constraints\n\n- deveríamos ser mais cuidadosos\n' }]);
  const report = checkConstitution(rules, [{ fromPath: 'qualquer/coisa.ts', targetLabel: 'deveríamos ser mais cuidadosos' }]);
  assert.equal(report.violations.length, 0, 'proposed não gera violação — só sinaliza via status, nunca bloqueia');
});

test('checkConstitution: require_dependency reporta violação quando a dependência exigida está ausente', () => {
  const rules = compileConstitution([{ source: 'x.md', content: '## Constraints\n\n- packages/billing usa PaymentGateway\n' }]);
  const missing = checkConstitution(rules, [{ fromPath: 'packages/billing/src/index.ts', targetLabel: 'SomeOtherThing' }]);
  assert.equal(missing.violations.length, 1);
  const present = checkConstitution(rules, [{ fromPath: 'packages/billing/src/index.ts', targetLabel: 'PaymentGateway' }]);
  assert.equal(present.violations.length, 0);
});

test('explainRule: retorna a regra pelo id, ou undefined se não existir', () => {
  const rules = compileConstitution([{ source: 'x.md', content: '## Constraints\n\n- packages/policy não depende de better-sqlite3\n' }]);
  assert.equal(explainRule(rules, rules[0].id)?.rationale, 'packages/policy não depende de better-sqlite3');
  assert.equal(explainRule(rules, 'inexistente'), undefined);
});
