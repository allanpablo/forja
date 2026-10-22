import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateCase, loadCases, globToRegExp, parseClaudeStream, parseCodexJson, grade, snapshot,
  runSuite, compareRuns, CLAUDE_ALLOWED_TOOLS, claudeAdapter, codexAdapter,
} from '../lib/agent-evals.ts';

// SPEC-054 (avaliacoes-de-agentes). Nenhum teste aqui chama um provedor real (SPEC-054 AC-7): os agentes são
// falsos, e o CLI roda com FORJA_EVAL_CLAUDE_BIN apontando para um script local.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const forjaBin = path.join(root, 'bin/forja.ts');
const CASES_DIR = path.join(root, 'templates/evals/agents');
const cases = loadCases(CASES_DIR);

const run = (over = {}) => ({ answer: '', commands: [], costUsd: null, tokens: null, durationMs: 1, exitCode: 0, ...over });

test('SPEC-054 AC-2: casos são dados validados; checks inválidos são recusados', () => {
  assert.throws(() => validateCase({ id: 'X maiúsculo', prompt: 'p', checks: [{ type: 'answer', desc: 'd', matches: ['a'] }] }), /kebab-case/);
  assert.throws(() => validateCase({ id: 'a', prompt: 'p', checks: [{ type: 'llm-juiz', desc: 'd' }] }), /tipo desconhecido/);
  assert.throws(() => validateCase({ id: 'a', prompt: 'p', checks: [{ type: 'answer', desc: 'd', matches: ['('] }] }), /regex inválida/);
  assert.throws(() => validateCase({ id: 'a', prompt: 'p', seed: { files: { '../fora.txt': 'x' } }, checks: [{ type: 'answer', desc: 'd', matches: ['a'] }] }), /fora do projeto/);
});

test('SPEC-054 AC-3: a suíte inicial cobre ADR, spec, teste por critério, memória e próxima ação', () => {
  assert.deepEqual(cases.map((c) => c.id).sort(), ['adr', 'memoria', 'proxima-acao', 'spec-nova', 'teste-do-criterio']);
  const types = new Set(cases.flatMap((c) => c.checks.map((k) => k.type)));
  for (const t of ['file', 'answer', 'ran', 'criterion', 'command', 'unchanged']) assert.ok(types.has(t), `nenhum caso usa o check ${t}`);
});

test('globToRegExp: ** atravessa pastas, * não', () => {
  assert.ok(globToRegExp('src/**').test('src/a/b.js'));
  assert.ok(globToRegExp('specs/*/spec.md').test('specs/x/spec.md'));
  assert.ok(!globToRegExp('specs/*/spec.md').test('specs/x/y/spec.md'));
  assert.ok(globToRegExp('memory/**/*.md').test('memory/a.md'));
  assert.ok(!globToRegExp('memory/90-decisions/*.md').test('memory/90-decisions/archive/a.md'));
});

test('parseClaudeStream: resposta, custo, comandos — sem os negados', () => {
  const lines = [
    { type: 'system', subtype: 'init' },
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'forja next' } }] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'rm -rf /' } }] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't3', name: 'mcp__forja__status', input: {} }] } },
    { type: 'result', subtype: 'success', is_error: false, result: 'Rode forja spec:plan', total_cost_usd: 0.12, usage: { input_tokens: 10, cache_read_input_tokens: 90, output_tokens: 5 }, permission_denials: [{ tool_name: 'Bash', tool_use_id: 't2' }] },
  ].map((l) => JSON.stringify(l)).join('\n');
  const p = parseClaudeStream(lines);
  assert.equal(p.answer, 'Rode forja spec:plan');
  assert.equal(p.costUsd, 0.12);
  assert.deepEqual(p.commands, ['forja next', 'tool:mcp__forja__status']);
  assert.deepEqual(p.tokens, { input: 100, output: 5 });
  assert.equal(p.error, undefined);
  assert.equal(parseClaudeStream('lixo').error, 'sem evento result');
});

test('parseCodexJson: desembrulha bash -lc, última mensagem, tokens', () => {
  const lines = [
    { type: 'thread.started' },
    { type: 'item.completed', item: { type: 'agent_message', text: 'Vou olhar.' } },
    { type: 'item.completed', item: { type: 'command_execution', command: "/usr/bin/bash -lc 'forja status'", exit_code: 0, status: 'completed' } },
    { type: 'item.completed', item: { type: 'command_execution', command: '/usr/bin/bash -lc ls', exit_code: 0 } },
    { type: 'item.completed', item: { type: 'agent_message', text: 'Faça o plano.' } },
    { type: 'turn.completed', usage: { input_tokens: 400, cached_input_tokens: 300, output_tokens: 7, reasoning_output_tokens: 3 } },
  ].map((l) => JSON.stringify(l)).join('\n');
  const p = parseCodexJson(lines);
  assert.deepEqual(p.commands, ['forja status', 'ls']);
  assert.equal(p.answer, 'Faça o plano.');
  assert.deepEqual(p.tokens, { input: 400, output: 10 });
  assert.equal(p.costUsd, null);
});

test('SPEC-054 AC-4: escrita confinada — sandbox do Codex e lista fechada do Claude', () => {
  let seen;
  const fake = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'forja-evalbin-')), 'agent');
  fs.writeFileSync(fake, '#!/bin/sh\necho "$@" > "$ARGS_OUT"\n');
  fs.chmodSync(fake, 0o755);
  const out = `${fake}.args`;
  const ctx = { projectDir: os.tmpdir(), workspaceDir: '/ws', prompt: 'p', env: { ...process.env, ARGS_OUT: out }, budgetUsd: 0.5, timeoutMs: 10_000 };
  codexAdapter(fake).run(ctx);
  seen = fs.readFileSync(out, 'utf8');
  assert.match(seen, /-s workspace-write -C \S+ --add-dir \/ws/);
  assert.ok(!seen.includes('danger-full-access') && !seen.includes('--dangerously'), seen);
  claudeAdapter(fake).run(ctx);
  seen = fs.readFileSync(out, 'utf8');
  assert.match(seen, /--permission-mode acceptEdits --add-dir \/ws --max-budget-usd 0\.5/);
  assert.ok(!seen.includes('bypassPermissions') && !seen.includes('--dangerously-skip-permissions'), seen);
  for (const t of CLAUDE_ALLOWED_TOOLS) if (t.startsWith('Bash(')) assert.ok(!/Bash\((\*|rm|curl|sh |bash)/.test(t), `comando aberto demais: ${t}`);
});

test('grade: cada tipo de check aprova e reprova pelo que ficou no disco', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-grade-'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src/a.js'), 'x');
  const before = snapshot(dir);
  fs.mkdirSync(path.join(dir, 'memory/90-decisions'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'memory/90-decisions/0001-banco.md'), '# ADR\n## Contexto\nPostgreSQL\n## Decisão\nusar\n');
  const g = (k, r = run()) => grade({ desc: 'd', ...k }, dir, r, before, process.env);
  assert.equal(g({ type: 'file', glob: 'memory/90-decisions/*.md', contains: ['postgres', '^## Decis[aã]o'] }).ok, true);
  assert.equal(g({ type: 'file', glob: 'memory/90-decisions/*.md', contains: ['mysql'] }).ok, false);
  assert.equal(g({ type: 'answer', matches: ['\\b3\\b'] }, run({ answer: 'vence em 3 dias' })).ok, true);
  assert.equal(g({ type: 'ran', matches: 'forja\\s+next' }, run({ commands: ['ls', 'forja next'] })).ok, true);
  assert.equal(g({ type: 'ran', matches: 'forja\\s+next' }, run({ commands: ['ls'] })).ok, false);
  assert.equal(g({ type: 'command', run: 'exit 0' }).ok, true);
  assert.equal(g({ type: 'command', run: 'exit 3' }).ok, false);
  assert.equal(g({ type: 'unchanged', glob: 'src/**' }).ok, true);
  // o índice da memória muda quando o agente consulta (query:universal): não é edição do agente
  fs.mkdirSync(path.join(dir, 'memory/sqlite'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'memory/sqlite/universal.db-wal'), 'x');
  const mem = g({ type: 'unchanged', glob: 'memory/**' });
  assert.match(mem.detail, /0001-banco\.md/, 'o ADR novo é mudança de verdade');
  assert.doesNotMatch(mem.detail, /sqlite/);
  fs.writeFileSync(path.join(dir, 'src/a.js'), 'mudou');
  assert.match(g({ type: 'unchanged', glob: 'src/**' }).detail, /mudou: src\/a\.js/);
});

// spec-trace:off — o agente falso escreve testes de exemplo que citam SPEC-001 (do projeto descartável)
/** Agente falso que faz o que o Forja pede, usando o `forja` do PATH que o runner preparou. */
const diligent = {
  name: 'diligente',
  version: () => 'fake 1',
  run(ctx) {
    const sh = (cmd) => spawnSync('sh', ['-c', cmd], { cwd: ctx.projectDir, env: ctx.env, encoding: 'utf8' });
    const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(ctx.projectDir, rel)), { recursive: true }); fs.writeFileSync(path.join(ctx.projectDir, rel), text); };
    const p = ctx.prompt;
    if (/PostgreSQL/.test(p)) w('memory/90-decisions/0001-postgres.md', '# ADR-0001: PostgreSQL\n\n## Contexto\nTransações e JSONB.\n\n## Decisão\nUsar PostgreSQL.\n');
    if (/extrato/.test(p)) {
      const r = sh('forja spec:new extrato-pdf');
      assert.equal(r.status, 0, `forja do PATH falhou: ${r.stdout}${r.stderr}`);
      const f = path.join(ctx.projectDir, 'specs/extrato-pdf/spec.md');
      fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('- [ ] AC-1: <observável, testável>', '- [ ] AC-1: o extrato do mês baixa em PDF'));
      return run({ commands: ['forja spec:new extrato-pdf'], answer: 'Spec criada.' });
    }
    if (/AC-1 da spec de pagamentos/.test(p)) {
      w('test/pagamentos.test.js', "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { validarValor } from '../src/pagamentos.js';\n\ntest('SPEC-001 AC-1: valor zero ou negativo é rejeitado', () => {\n  assert.throws(() => validarValor(0), /valor inválido/);\n  assert.throws(() => validarValor(-5), /valor inválido/);\n});\n");
      return run({ commands: ['node --test'], answer: 'Teste escrito.' });
    }
    if (/boleto/.test(p)) return run({ commands: ['forja query:universal boleto'], answer: 'Vence em 3 dias úteis (memory/30-domains/cobranca/context.md).' });
    if (/férias/.test(p)) {
      const r = sh('forja next');
      return run({ commands: ['forja next'], answer: r.stdout.trim() });
    }
    return run({ answer: 'ok' });
  },
};

// spec-trace:on

const lazy = { name: 'preguicoso', version: () => 'fake 1', run: () => run({ answer: 'Feito!' }) };

test('SPEC-054 AC-1: projeto descartável por caso, semente aplicada, forja em teste no PATH — agente diligente passa tudo', { timeout: 180_000 }, () => {
  const seen = [];
  const r = runSuite(cases, diligent, '0.0.0-teste', { forjaBin, budgetUsd: 1, timeoutMs: 60_000, onCase: (_c, cr) => seen.push(cr.id) });
  const failed = r.cases.filter((c) => !c.pass).map((c) => `${c.id}: ${c.checks.filter((k) => !k.ok).map((k) => `${k.desc} (${k.detail})`).join('; ')} ${c.error ?? ''}`);
  assert.deepEqual(failed, []);
  assert.equal(r.passed, 5);
  assert.deepEqual(seen, cases.map((c) => c.id));
  assert.equal(r.agent, 'diligente');
});

test('SPEC-054 AC-1: agente que só diz "feito" reprova, e o diretório temporário some', { timeout: 120_000 }, () => {
  const before = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('forja-eval-preguicoso-')).length;
  const r = runSuite(cases.filter((c) => ['adr', 'proxima-acao'].includes(c.id)), lazy, '0.0.0-teste', { forjaBin, budgetUsd: 1, timeoutMs: 60_000 });
  assert.equal(r.passed, 0);
  const adr = r.cases.find((c) => c.id === 'adr');
  assert.match(adr.checks[0].detail, /nenhum arquivo/);
  assert.equal(adr.checks[1].ok, true, 'não mexer no template continua valendo');
  assert.equal(fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('forja-eval-preguicoso-')).length, before);
});

test('SPEC-054 AC-5: compara com a execução anterior (passou a falhar / a passar)', () => {
  const mk = (pass) => ({ cases: Object.entries(pass).map(([id, p]) => ({ id, pass: p })) });
  assert.deepEqual(compareRuns(mk({ a: true, b: false, c: true }), mk({ a: false, b: true, c: true })), { regressed: ['a'], fixed: ['b'] });
  assert.deepEqual(compareRuns(null, mk({ a: true })), { regressed: [], fixed: [] });
});

function cli(args, env) {
  return spawnSync(process.execPath, [forjaBin, 'eval:agents', ...args], { cwd: root, encoding: 'utf8', env, timeout: 120_000 });
}

test('SPEC-054 AC-6: sem --agent, agente ausente ou caso inexistente → exit 1 com código', () => {
  const env = { ...process.env, FORJA_WORKSPACE: path.join(os.tmpdir(), 'forja-eval-no-ws') };
  assert.equal(JSON.parse(cli(['--json'], env).stdout).error.code, 'MISSING_ARG');
  let r = cli(['--agent', 'claude', '--json'], { ...env, FORJA_EVAL_CLAUDE_BIN: '/nao/existe/claude' });
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).error.code, 'AGENT_MISSING');
  r = cli(['--agent', 'gpt-agent', '--json'], env);
  assert.equal(r.status, 1);
  const fake = fakeClaude();
  r = cli(['--agent', 'claude', '--case', 'nao-existe', '--json'], { ...env, FORJA_EVAL_CLAUDE_BIN: fake });
  assert.equal(JSON.parse(r.stdout).error.code, 'NOT_FOUND');
});

/** `claude` falso: imprime um stream-json válido e não faz nada (o caso reprova). */
function fakeClaude() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-fakeclaude-'));
  const bin = path.join(dir, 'claude');
  fs.writeFileSync(bin, `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "9.9.9 (fake)"; exit 0; fi\necho '{"type":"result","subtype":"success","is_error":false,"result":"Feito!","total_cost_usd":0.01}'\n`);
  fs.chmodSync(bin, 0o755);
  return bin;
}

test('SPEC-054 AC-5 AC-6: falha → exit 2 (rejected) e histórico no workspace, comparado na execução seguinte', { timeout: 120_000 }, () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-eval-ws-'));
  const env = { ...process.env, FORJA_WORKSPACE: ws, FORJA_EVAL_CLAUDE_BIN: fakeClaude() };
  let r = cli(['--agent', 'claude', '--case', 'adr', '--json'], env);
  assert.equal(r.status, 2, r.stderr);
  const d = JSON.parse(r.stdout);
  assert.equal(d.status, 'rejected');
  assert.equal(d.agentVersion, '9.9.9 (fake)');
  assert.equal(d.costUsd, 0.01);
  const hist = path.join(ws, '.context', 'agent-evals.jsonl');
  assert.equal(fs.readFileSync(hist, 'utf8').trim().split('\n').length, 1);

  r = cli(['--agent', 'claude', '--case', 'adr'], env);
  assert.equal(r.status, 2);
  assert.match(r.stdout, /✗ adr/);
  assert.match(r.stdout, /Comparado com .* 0\/1/);
  assert.equal(fs.readFileSync(hist, 'utf8').trim().split('\n').length, 2);
});
