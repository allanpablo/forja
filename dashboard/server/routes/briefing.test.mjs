import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildServer } from '../index.mjs';
import { parseBriefing, renderSections } from '../lib/briefing-parser.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const realRepoRoot = path.resolve(__dirname, '..', '..', '..');

/**
 * Para testar a rota briefing precisamos de um workspace temporário isolado
 * com o template de spec do repo real. O briefing cria specs no workspace.
 */
function makeIsolatedRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-brf-'));
  process.env.FORJA_WORKSPACE = root;
  fs.mkdirSync(path.join(root, 'specs', '_templates'), { recursive: true });
  for (const f of ['spec.md', 'plan.md', 'tasks.md']) {
    fs.copyFileSync(
      path.join(realRepoRoot, 'specs/_templates', f),
      path.join(root, 'specs/_templates', f),
    );
  }
  return root;
}

test('parseBriefing extrai problema, valor e stories', () => {
  const brief = `Hoje os agentes não tem visibilidade de quanto cada projeto consome de tokens, é difícil decidir onde investir.

Queremos um painel que mostre em tempo quase-real o consumo agregado por projeto.

Como autor, quero ver tokens por dia, para que eu identifique gargalos.
Como dev, quero clicar botões dos comandos principais, para que eu não precise lembrar a CLI.`;

  const r = parseBriefing(brief);
  assert.match(r.problem, /Hoje/);
  assert.match(r.value, /painel/i);
  assert.equal(r.stories.length, 2);
  assert.equal(r.stories[0].persona, 'autor');
  assert.match(r.stories[0].action, /tokens/);
  assert.match(r.stories[1].benefit, /CLI/);
});

test('renderSections gera markdown válido com fallbacks', () => {
  const md = renderSections({ problem: null, value: null, stories: [], notes: [] });
  assert.match(md, /## 1\. Problema/);
  assert.match(md, /não detectado/);
  assert.match(md, /## 3\. User stories/);
});

test('POST /api/briefing recusa brief curto', async () => {
  const root = makeIsolatedRoot();
  const app = buildServer({ logger: false, repoRoot: root });
  const res = await app.inject({
    method: 'POST', url: '/api/briefing',
    payload: { brief: 'curto', slug: 'qualquer-coisa' },
  });
  await app.close();
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().code, 'BRIEF_TOO_SHORT');
});

test('POST /api/briefing recusa slug inválido', async () => {
  const root = makeIsolatedRoot();
  const app = buildServer({ logger: false, repoRoot: root });
  for (const bad of ['../etc', 'Foo', 'has spaces', 'a']) {
    const res = await app.inject({
      method: 'POST', url: '/api/briefing',
      payload: { brief: 'b'.repeat(50), slug: bad },
    });
    assert.equal(res.statusCode, 400, `${bad} deveria 400`);
  }
  await app.close();
});

test('POST /api/briefing cria spec em status=draft com seções preenchidas', async () => {
  const root = makeIsolatedRoot();
  const app = buildServer({ logger: false, repoRoot: root });
  const brief = `O problema hoje é que ninguém vê o consumo de tokens em tempo real.

Queremos um painel local que mostre tudo em uma tela.

Como autor, quero ver gráfico de tokens, para que eu detecte regressões.`;
  const res = await app.inject({
    method: 'POST', url: '/api/briefing',
    payload: { brief, slug: 'novo-painel' },
  });
  await app.close();
  assert.equal(res.statusCode, 200, `body=${res.body}`);
  const body = res.json();
  assert.equal(body.slug, 'novo-painel');
  assert.equal(body.parsed.stories.length, 1);

  const created = fs.readFileSync(path.join(root, 'specs', 'novo-painel', 'spec.md'), 'utf8');
  assert.match(created, /- \*\*Status\*\*: draft/);
  assert.match(created, /## 1\. Problema/);
  assert.match(created, /ninguém vê/i);
  assert.match(created, /autor.*gráfico|gráfico.*autor/is);
});

test('POST /api/briefing força draft mesmo se o template já tivesse outro status', async () => {
  const root = makeIsolatedRoot();
  // corrompe o template para tentar "implementing" — a rota deve sobrescrever
  const tpl = path.join(root, 'specs/_templates/spec.md');
  let t = fs.readFileSync(tpl, 'utf8');
  t = t.replace(/-\s*\*\*Status\*\*:.*/i, '- **Status**: implementing');
  fs.writeFileSync(tpl, t);

  const app = buildServer({ logger: false, repoRoot: root });
  const res = await app.inject({
    method: 'POST', url: '/api/briefing',
    payload: { brief: 'b'.repeat(50) + ' problema queremos', slug: 'forca-draft' },
  });
  await app.close();
  assert.equal(res.statusCode, 200);
  const created = fs.readFileSync(path.join(root, 'specs', 'forca-draft', 'spec.md'), 'utf8');
  assert.match(created, /- \*\*Status\*\*: draft/);
  assert.doesNotMatch(created, /implementing/);
});

test('POST /api/briefing 409 se slug já existe', async () => {
  const root = makeIsolatedRoot();
  fs.mkdirSync(path.join(root, 'specs', 'ja-existe'), { recursive: true });
  fs.writeFileSync(path.join(root, 'specs', 'ja-existe', 'spec.md'), '# existing');

  const app = buildServer({ logger: false, repoRoot: root });
  const res = await app.inject({
    method: 'POST', url: '/api/briefing',
    payload: { brief: 'b'.repeat(50) + ' problema queremos', slug: 'ja-existe' },
  });
  await app.close();
  assert.equal(res.statusCode, 409);
  assert.equal(res.json().code, 'SPEC_EXISTS');
});

test('POST /api/briefing adiciona Projeto-alvo quando projectHint passado', async () => {
  const root = makeIsolatedRoot();
  const app = buildServer({ logger: false, repoRoot: root });
  const res = await app.inject({
    method: 'POST', url: '/api/briefing',
    payload: { brief: 'b'.repeat(50) + ' problema queremos', slug: 'com-hint', projectHint: 'ai-medico' },
  });
  await app.close();
  assert.equal(res.statusCode, 200);
  const created = fs.readFileSync(path.join(root, 'specs', 'com-hint', 'spec.md'), 'utf8');
  assert.match(created, /Projeto-alvo.*ai-medico/);
});
