import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { digestTranscript, writeCheckpoint, findCheckpoint } from '../lib/session-memory.ts';
import { HOOKS, wireProject, checkProjectWiring } from '../lib/project-wiring.ts';
import { COMMANDS } from '../lib/core/registry.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const forja = path.join(root, 'bin/forja.ts');
const SID = 'abcd1234-0000-4000-8000-000000000000';
const SECRET = 'sk-ant-SEGREDO-NAO-PODE-VAZAR';

function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-session-'));
  fs.mkdirSync(path.join(dir, 'memory'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'specs', 'pagamentos'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'specs', 'pagamentos', 'spec.md'), '# Spec: pagamentos\n');
  return dir;
}

let seq = 0;
/** tool_use seguido do tool_result (com erro quando `error`): só o que deu certo conta. */
const tool = (name, input, { error = false, ts = '2026-10-21T10:00:00.000Z' } = {}) => {
  const id = `toolu_${++seq}`;
  return [
    JSON.stringify({ type: 'assistant', timestamp: ts, gitBranch: 'feat/pagamentos', sessionId: SID, message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } }),
    JSON.stringify({ type: 'user', timestamp: ts, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: error, content: error ? 'negado' : 'ok' }] } }),
  ].join('\n');
};

function transcript(dir, lines) {
  const file = path.join(dir, 'transcript.jsonl');
  fs.writeFileSync(file, lines.join('\n') + '\n');
  return file;
}

function workTranscript(dir) {
  return transcript(dir, [
    JSON.stringify({ type: 'user', timestamp: '2026-10-21T09:59:00.000Z', message: { role: 'user', content: `minha chave é ${SECRET}, implementa pagamentos` } }),
    JSON.stringify({ type: 'ai-title', aiTitle: 'Implementar pagamentos', sessionId: SID }),
    tool('Edit', { file_path: path.join(dir, 'specs/pagamentos/plan.md'), old_string: 'a', new_string: 'b' }),
    tool('Write', { file_path: path.join(dir, 'src/pagamentos.ts'), content: SECRET }),
    tool('Write', { file_path: '/etc/fora-do-projeto.conf', content: 'x' }),
    tool('Write', { file_path: path.join(dir, 'src/negado.ts'), content: 'x' }, { error: true }),
    tool('Bash', { command: 'git commit -m "feat: commit que falhou"' }, { error: true }),
    tool('Bash', { command: `API_KEY=${SECRET} forja spec:check pagamentos && forja e depois` }),
    tool('Bash', { command: `git commit -m "$(cat <<'EOF'\nfeat(pagamentos): cobra no cartão\n\ncorpo com ${SECRET}\nEOF\n)"` }),
    'isto não é json {',
  ]);
}

test('AC-1: checkpoint com título, branch, arquivos, comandos forja, specs e commits', () => {
  const dir = project();
  const d = digestTranscript(workTranscript(dir), dir, SID);
  assert.equal(d.title, 'Implementar pagamentos');
  assert.equal(d.branch, 'feat/pagamentos');
  assert.deepEqual(d.files, ['specs/pagamentos/plan.md', 'src/pagamentos.ts'], 'arquivo fora do projeto ou edição negada não entra');
  assert.deepEqual(d.forjaCommands, ['spec:check'], '"forja e" não é comando');
  assert.deepEqual(d.specs, ['pagamentos']);
  assert.deepEqual(d.commits, ['feat(pagamentos): cobra no cartão']);
});

test('AC-2: nenhum texto de prompt, argumento ou conteúdo vaza para o checkpoint', () => {
  const dir = project();
  const file = writeCheckpoint(dir, workTranscript(dir), SID, 'Stop');
  assert.ok(file && file.endsWith(path.join('memory', '60-runs', 'sessions', '2026-10-21-abcd1234.md')));
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(!text.includes(SECRET), 'segredo vazou para a memória');
  assert.ok(!text.includes('minha chave'), 'texto de prompt vazou');
  assert.match(text, /Implementar pagamentos/);
});

test('AC-2: mesma sessão reescreve o mesmo arquivo; sessão sem trabalho não grava', () => {
  const dir = project();
  const t = workTranscript(dir);
  const a = writeCheckpoint(dir, t, SID, 'Stop');
  const b = writeCheckpoint(dir, t, SID, 'PreCompact');
  assert.equal(a, b);
  assert.equal(fs.readdirSync(path.dirname(a)).length, 1);
  assert.match(fs.readFileSync(b, 'utf8'), /\(PreCompact\)/);

  const idle = project();
  const conversa = transcript(idle, [JSON.stringify({ type: 'user', timestamp: '2026-10-21T09:00:00.000Z', message: { role: 'user', content: 'o que é DDD?' } })]);
  assert.equal(writeCheckpoint(idle, conversa, SID, 'Stop'), null);
  assert.equal(fs.existsSync(path.join(idle, 'memory', '60-runs', 'sessions')), false);
});

test('AC-3: o hook nunca derruba a sessão (stdin inválido, transcript ausente, sem memory/)', () => {
  const dir = project();
  for (const input of ['não é json', '{}', JSON.stringify({ session_id: SID, transcript_path: '/nao/existe.jsonl' })]) {
    const r = spawnSync(process.execPath, [forja, 'hook:session-memory'], { cwd: dir, input, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: dir } });
    assert.equal(r.status, 0, `${input}: ${r.stderr}`);
    assert.equal(r.stdout, '', 'Stop com saída poderia bloquear o turno');
  }
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-session-bare-'));
  const t = workTranscript(bare);
  const r = spawnSync(process.execPath, [forja, 'hook:session-memory'], { cwd: bare, input: JSON.stringify({ session_id: SID, transcript_path: t, hook_event_name: 'Stop' }), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: bare } });
  assert.equal(r.status, 0);
  assert.equal(fs.existsSync(path.join(bare, 'memory')), false, 'criou memory/ num diretório que não é projeto');
});

test('AC-4: project:wire registra Stop e PreCompact; --check falha sem eles', () => {
  assert.equal(HOOKS.Stop, 'hook:session-memory');
  assert.equal(HOOKS.PreCompact, 'hook:session-memory');
  const dir = project();
  wireProject(dir, { ai: ['claude'], codegraph: false });
  const settings = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8'));
  for (const ev of ['SessionStart', 'UserPromptSubmit', 'Stop', 'PreCompact']) assert.ok(settings.hooks[ev]?.length, `sem hook ${ev}`);
  const hooks = () => checkProjectWiring(dir, { commands: COMMANDS }).find((c) => c.id === 'claude-hooks');
  assert.equal(hooks().status, 'ok');

  delete settings.hooks.PreCompact;
  fs.writeFileSync(path.join(dir, '.claude', 'settings.json'), JSON.stringify(settings));
  assert.equal(hooks().status, 'fail');
  assert.match(hooks().detail, /PreCompact/);
});

test('AC-5: SessionStart compact devolve o checkpoint; startup aponta a última sessão', () => {
  const dir = project();
  const t = workTranscript(dir);
  spawnSync(process.execPath, [forja, 'hook:session-memory'], { cwd: dir, input: JSON.stringify({ session_id: SID, transcript_path: t, hook_event_name: 'PreCompact' }), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: dir } });
  assert.ok(findCheckpoint(dir, SID), 'hook via CLI não gravou o checkpoint');

  const start = (input) => {
    const r = spawnSync(process.execPath, [forja, 'hook:session-start'], { cwd: dir, input: JSON.stringify(input), encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  };
  const compact = start({ session_id: SID, source: 'compact' });
  assert.match(compact, /Checkpoint desta sessão/);
  assert.match(compact, /src\/pagamentos\.ts/);
  assert.ok(!compact.includes('forja:session-memory'), 'comentário interno vazou para o contexto');

  const next = start({ session_id: 'outra-sessao', source: 'startup' });
  assert.match(next, /Última sessão: .*Implementar pagamentos · 2 arquivo\(s\) · specs: pagamentos/);
  assert.ok(!start({ session_id: SID, source: 'clear' }).includes('Última sessão'));
});

test('NFR: transcript de ~10 MB processado em menos de 1 s', () => {
  const dir = project();
  const filler = JSON.stringify({ type: 'user', timestamp: '2026-10-21T09:00:00.000Z', message: { role: 'user', content: 'x'.repeat(2000) } });
  const lines = Array.from({ length: 5000 }, (_, i) => (i % 50 === 0 ? tool('Edit', { file_path: path.join(dir, `src/f${i}.ts`) }) : filler));
  const t = transcript(dir, lines);
  assert.ok(fs.statSync(t).size > 9_000_000);
  const t0 = performance.now();
  const d = digestTranscript(t, dir, SID);
  assert.ok(performance.now() - t0 < 1000, `${Math.round(performance.now() - t0)} ms`);
  assert.equal(d.files.length, 100);
});
