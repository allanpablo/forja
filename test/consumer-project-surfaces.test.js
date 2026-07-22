import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const bin = path.join(repoRoot, 'bin', 'forja.ts');

/**
 * Regressão da CLASSE de bug "o comando opera no pacote, não no projeto do consumidor" — a mesma que
 * mordeu spec:new (v1.6.2) e project:check (v1.7.1), agora nos comandos gsd:* e context:*.
 *
 * Aqui a prova é EXECUTADA, não asserida: rodamos o dispatcher real de dentro de um cwd isolado e
 * conferimos ONDE o efeito caiu. Se agent-harness/context-ops voltarem a cravar `__dirname/..` para as
 * superfícies do projeto, o runbook cairia no repo do framework (não no tmp) e o budget não o acharia.
 */
function inTmp(fn) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-surfaces-'));
  try {
    return fn(cwd);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

// context:budget grava um `context_run` via recordContextRun. Sem isolar o workspace, isso criaria/
// tocaria o universal.db COMPARTILHADO — e num CI (sem índice) `ensureSchema` cria o banco sem a tabela
// memory_nodes, fazendo o gate `memory-db` do doctor reprovar depois. FORJA_WORKSPACE contém o efeito.
const runIn = (cwd, args) =>
  spawnSync('node', [bin, ...args], {
    encoding: 'utf8',
    cwd,
    env: { ...process.env, FORJA_WORKSPACE: path.join(cwd, '.forja-workspace') },
  });

test('gsd:plan grava o runbook no cwd do consumidor, não no repo do framework', () => {
  inTmp((cwd) => {
    const slug = 'smoke-surface';
    const r = runIn(cwd, ['gsd:plan', slug, 'objetivo de fumaça']);
    assert.equal(r.status, 0, `stdout=${r.stdout} stderr=${r.stderr}`);

    const noCwd = path.join(cwd, '.context', `gsd-${slug}.md`);
    assert.ok(fs.existsSync(noCwd), 'o runbook tem de existir em <cwd>/.context/');

    const noRepo = path.join(repoRoot, '.context', `gsd-${slug}.md`);
    assert.ok(!fs.existsSync(noRepo), 'o runbook NÃO pode vazar para o repo do framework');
  });
});

test('context:budget acha o runbook que gsd escreveu no cwd (resolve por projectRoot)', () => {
  inTmp((cwd) => {
    const slug = 'smoke-surface';
    runIn(cwd, ['gsd:plan', slug, 'objetivo']);
    const r = runIn(cwd, ['context:budget', slug]);

    const saida = `${r.stdout || ''}${r.stderr || ''}`;
    assert.doesNotMatch(
      saida,
      /nao encontrado|não encontrado|fora do projeto/i,
      `budget devia achar o runbook do cwd; saída: ${saida}`
    );
    assert.match(saida, /tokens estimados/, 'budget devia medir o runbook achado no cwd');
  });
});

/**
 * Rede a nível de fonte: quem toca as superfícies do projeto precisa separar `projectRoot`
 * (process.cwd()) de `root` (recursos do framework via __dirname). É o que impede a regressão silenciosa.
 */
for (const f of ['scripts/agent-harness.ts', 'scripts/context-ops.ts']) {
  test(`${f} separa projectRoot (cwd) de root (framework)`, () => {
    const src = fs.readFileSync(path.join(repoRoot, f), 'utf8');
    assert.match(src, /const projectRoot = process\.cwd\(\)/, 'define projectRoot = process.cwd()');
    assert.doesNotMatch(
      src,
      /path\.join\(root, '\.context'/,
      '.context é superfície do projeto — use projectRoot, não root'
    );
  });
}
