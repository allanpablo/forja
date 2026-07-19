import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { addSpecToAllowlist } from '../scripts/spec-cli.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cli = path.resolve(__dirname, '..', 'scripts', 'spec-cli.ts');
const repoRoot = path.resolve(__dirname, '..');

// spec:new mantém a allow-list do .gitignore (AC-11). Estes testes rodam contra o repo real, então
// apontamos o CLI para um .gitignore descartável — senão cada execução da suíte sujaria o de verdade.
const sandboxGitignore = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'forja-spec-cli-')),
  '.gitignore'
);
fs.writeFileSync(sandboxGitignore, '/specs/*\n!/specs/README.md\n!/specs/_templates\n');

function run(args, opts = {}) {
  return spawnSync('node', [cli, ...args], {
    encoding: 'utf8',
    cwd: repoRoot,
    ...opts,
    env: { ...process.env, FORJA_GITIGNORE: sandboxGitignore, ...opts.env },
  });
}

test('spec:check sem features não falha quando dir vazio', () => {
  // este teste roda contra o repo real; tolera presença da meta-spec
  const r = run(['check']);
  assert.equal(r.status, 0, `stdout=${r.stdout} stderr=${r.stderr}`);
});

test('spec:plan falha quando spec em draft', () => {
  // a meta-spec está em "implementing", então plan deveria funcionar
  // mas criamos uma fresh
  const tmpName = `test-feature-${Date.now()}`;
  const created = run(['new', tmpName]);
  assert.equal(created.status, 0);
  try {
    const r = run(['plan', tmpName]);
    assert.notEqual(r.status, 0, 'plan deveria falhar em spec draft');
    assert.match(r.stderr, /status "draft"/);
  } finally {
    fs.rmSync(path.join(repoRoot, 'specs', tmpName), { recursive: true, force: true });
  }
});

test('spec:new cria estrutura', () => {
  const tmpName = `test-create-${Date.now()}`;
  try {
    const r = run(['new', tmpName]);
    assert.equal(r.status, 0);
    const specPath = path.join(repoRoot, 'specs', tmpName, 'spec.md');
    assert.ok(fs.existsSync(specPath), 'spec.md deveria existir');
    const content = fs.readFileSync(specPath, 'utf8');
    assert.match(content, new RegExp(`Spec: ${tmpName}`));
  } finally {
    fs.rmSync(path.join(repoRoot, 'specs', tmpName), { recursive: true, force: true });
  }
});

test('spec:new recusa duplicado', () => {
  const tmpName = `test-dup-${Date.now()}`;
  try {
    run(['new', tmpName]);
    const r = run(['new', tmpName]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /já existe/);
  } finally {
    fs.rmSync(path.join(repoRoot, 'specs', tmpName), { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// allow-list do .gitignore (AC-11)
//
// /specs/* é ignorado e as specs do framework entram por allow-list manual. Toda spec nova
// nascia invisível ao git — criada, aprovada pelo check, descartada em silêncio.
// ---------------------------------------------------------------------------

const BASE_GITIGNORE = [
  '/specs/*',
  '!/specs/README.md',
  '!/specs/_templates',
  '!/specs/forja-core',
  '',
  '# Runbooks GSD são efêmeros',
  '.context/',
  '',
].join('\n');

test('addSpecToAllowlist insere a spec no bloco', () => {
  const { changed, content, reason } = addSpecToAllowlist(BASE_GITIGNORE, 'nova-spec');
  assert.equal(changed, true);
  assert.equal(reason, 'added');
  assert.match(content, /^!\/specs\/nova-spec$/m);
});

test('addSpecToAllowlist é idempotente', () => {
  const once = addSpecToAllowlist(BASE_GITIGNORE, 'nova-spec').content;
  const twice = addSpecToAllowlist(once, 'nova-spec');
  assert.equal(twice.changed, false);
  assert.equal(twice.reason, 'already-present');
  assert.equal(twice.content, once);
});

test('addSpecToAllowlist insere dentro do bloco, não no fim do arquivo', () => {
  // As regras seguintes do .gitignore dependem da ordem: uma linha solta no fim ficaria
  // depois de padrões que poderiam re-ignorar a spec.
  const lines = addSpecToAllowlist(BASE_GITIGNORE, 'nova-spec').content.split('\n');
  const inserted = lines.indexOf('!/specs/nova-spec');
  assert.equal(inserted, lines.indexOf('!/specs/forja-core') + 1, 'deveria seguir a última entrada');
  assert.ok(inserted < lines.indexOf('.context/'), 'não deveria cair após o bloco');
});

test('addSpecToAllowlist não inventa bloco quando ele não existe', () => {
  const semBloco = 'node_modules/\n.env\n';
  const r = addSpecToAllowlist(semBloco, 'nova-spec');
  assert.equal(r.changed, false);
  assert.equal(r.reason, 'no-block');
  assert.equal(r.content, semBloco, 'não deveria tocar no arquivo');
});

test('spec:new versiona a spec e não falha se o .gitignore some', () => {
  const tmpName = `test-ignore-${Date.now()}`;
  const gitignore = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'forja-gi-')), '.gitignore');
  fs.writeFileSync(gitignore, BASE_GITIGNORE);
  try {
    const r = run(['new', tmpName], { env: { FORJA_GITIGNORE: gitignore } });
    assert.equal(r.status, 0);
    assert.match(fs.readFileSync(gitignore, 'utf8'), new RegExp(`^!/specs/${tmpName}$`, 'm'));

    // Criar a spec é o trabalho; manter o .gitignore é o efeito colateral. Sem o arquivo, avisa e segue.
    fs.rmSync(gitignore);
    const semArquivo = run(['new', `${tmpName}-b`], { env: { FORJA_GITIGNORE: gitignore } });
    assert.equal(semArquivo.status, 0, 'spec:new não pode falhar por causa do .gitignore');
    assert.match(semArquivo.stdout, /⚠/);
  } finally {
    fs.rmSync(path.join(repoRoot, 'specs', tmpName), { recursive: true, force: true });
    fs.rmSync(path.join(repoRoot, 'specs', `${tmpName}-b`), { recursive: true, force: true });
  }
});
