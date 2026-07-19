#!/usr/bin/env node
/**
 * spec-cli — pipeline SDD
 *
 * Comandos:
 *   spec:new <feature>     cria specs/<feature>/spec.md a partir do template
 *   spec:plan <feature>    cria plan.md (exige spec.md aprovada)
 *   spec:tasks <feature>   cria tasks.md (exige plan.md aprovado)
 *   spec:check [feature]   valida 1 feature ou todas
 *
 * Convenções:
 * - feature-slug em kebab-case
 * - status na frontmatter-like "- **Status**: ..." linha 3
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const specsDir = path.join(repoRoot, 'specs');
const templatesDir = path.join(specsDir, '_templates');

const STAGES = ['spec', 'plan', 'tasks'];
const STATUS_RE = /-\s*\*\*Status\*\*:\s*([a-z]+)[^\n]*/i;
const VALID_STATUSES = ['draft', 'review', 'approved', 'implementing', 'done', 'abandoned'];

/** @returns {never} */
function fail(msg): never {
  fs.writeSync(2, `[spec-cli] ${msg}\n`);
  process.exit(1);
}

function out(msg = '') {
  fs.writeSync(1, `${msg}\n`);
}

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function readTemplate(stage) {
  const p = path.join(templatesDir, `${stage}.md`);
  if (!fs.existsSync(p)) fail(`template ${stage}.md ausente em ${templatesDir}`);
  return fs.readFileSync(p, 'utf8');
}

function fillTemplate(tpl, vars) {
  return tpl
    .replace(/{{FEATURE}}/g, vars.feature)
    .replace(/{{ID}}/g, vars.id)
    .replace(/{{OWNER}}/g, vars.owner || '—')
    .replace(/{{DATE}}/g, vars.date);
}

function readStatus(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  const m = content.match(STATUS_RE);
  return m ? m[1].toLowerCase() : 'unknown';
}

function listFeatures() {
  if (!fs.existsSync(specsDir)) return [];
  return fs.readdirSync(specsDir)
    .filter(name => !name.startsWith('_') && !name.startsWith('.'))
    .filter(name => fs.statSync(path.join(specsDir, name)).isDirectory());
}

/**
 * `.gitignore` ignora `/specs/*` e libera as specs do framework por allow-list. Uma spec nova
 * nascia invisível ao git: criada, aprovada pelo check, e descartada em silêncio. A regra existia
 * só como convenção — e convenção que depende de memória não é regra. Passa a viver no harness
 * (ADR-0021).
 *
 * Puro de propósito: recebe e devolve conteúdo, para ser testável sem tocar no .gitignore real.
 *
 * @returns {{ changed: boolean, content: string, reason: 'added'|'already-present'|'no-block' }}
 */
export function addSpecToAllowlist(content, slug) {
  const line = `!/specs/${slug}`;
  const lines = content.split('\n');

  if (lines.some((l) => l.trim() === line)) {
    return { changed: false, content, reason: 'already-present' };
  }

  // Insere após a última entrada do bloco, não no fim do arquivo: as regras seguintes do
  // .gitignore dependem da ordem.
  let anchor = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim().startsWith('!/specs/')) anchor = i;
  }
  if (anchor === -1) return { changed: false, content, reason: 'no-block' };

  lines.splice(anchor + 1, 0, line);
  return { changed: true, content: lines.join('\n'), reason: 'added' };
}

function gitignorePath() {
  return process.env.FORJA_GITIGNORE || path.join(repoRoot, '.gitignore');
}

/** Efeito colateral de `spec:new`. Nunca derruba a criação da spec — criar a spec é o trabalho. */
function ensureSpecVersioned(slug) {
  const file = gitignorePath();
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    out('  ⚠ .gitignore não encontrado — confira se a spec será versionada.');
    return;
  }

  const result = addSpecToAllowlist(raw, slug);
  if (result.reason === 'no-block') {
    out('  ⚠ bloco allow-list de specs ausente no .gitignore — versione a spec manualmente.');
    return;
  }
  if (!result.changed) return;

  try {
    fs.writeFileSync(file, result.content);
    out(`  + .gitignore: !/specs/${slug}`);
  } catch {
    out(`  ⚠ não foi possível escrever .gitignore — adicione "!/specs/${slug}" manualmente.`);
  }
}

function cmdNew(feature) {
  if (!feature) fail('uso: spec:new <feature>');
  const slug = slugify(feature);
  const dir = path.join(specsDir, slug);
  if (fs.existsSync(dir)) fail(`spec ${slug} já existe em ${dir}`);
  fs.mkdirSync(dir, { recursive: true });
  const tpl = readTemplate('spec');
  const content = fillTemplate(tpl, {
    feature: slug,
    id: `SPEC-${String(listFeatures().length + 1).padStart(3, '0')}`,
    owner: process.env.USER || '—',
    date: todayISO(),
  });
  fs.writeFileSync(path.join(dir, 'spec.md'), content);
  out(`✓ criada: specs/${slug}/spec.md`);
  ensureSpecVersioned(slug);
  out('  edite, mude status para "review", peça revisão.');
}

function cmdNextStage(stage, feature) {
  if (!feature) fail(`uso: spec:${stage} <feature>`);
  const slug = slugify(feature);
  const dir = path.join(specsDir, slug);
  if (!fs.existsSync(dir)) fail(`feature ${slug} não existe — rode spec:new primeiro`);

  const prevStage = STAGES[STAGES.indexOf(stage) - 1];
  const prevStatus = readStatus(path.join(dir, `${prevStage}.md`));
  if (!prevStatus) fail(`${prevStage}.md não existe em ${dir}`);
  if (!['approved', 'implementing', 'done'].includes(prevStatus)) {
    fail(`${prevStage}.md está em status "${prevStatus}". Precisa de "approved" para gerar ${stage}.md`);
  }

  const outputPath = path.join(dir, `${stage}.md`);
  if (fs.existsSync(outputPath)) fail(`${stage}.md já existe`);
  const tpl = readTemplate(stage);
  fs.writeFileSync(outputPath, fillTemplate(tpl, { feature: slug, id: '', owner: '—', date: todayISO() }));
  out(`✓ criada: specs/${slug}/${stage}.md`);
}

function checkFeature(slug) {
  const dir = path.join(specsDir, slug);
  const result = { slug, stages: {} as Record<string, string | null>, ok: true, errors: [] as string[] };
  for (const stage of STAGES) {
    const status = readStatus(path.join(dir, `${stage}.md`));
    result.stages[stage] = status;
  }
  // Regras
  // `abandoned` é terminal: uma feature pode ter avançado até plan/tasks antes de parar,
  // e isso não é incoerência — é história. Ver ADR-0022.
  const ALLOWS_NEXT_STAGE = ['approved', 'implementing', 'done', 'abandoned'];
  if (!result.stages.spec) {
    result.ok = false;
    result.errors.push('spec.md ausente');
  }
  if (result.stages.plan && !ALLOWS_NEXT_STAGE.includes(result.stages.spec ?? '')) {
    result.ok = false;
    result.errors.push(`plan.md existe mas spec status = ${result.stages.spec}`);
  }
  if (result.stages.tasks && !ALLOWS_NEXT_STAGE.includes(result.stages.plan ?? '')) {
    result.ok = false;
    result.errors.push(`tasks.md existe mas plan status = ${result.stages.plan}`);
  }
  return result;
}

function cmdCheck(feature) {
  const features = feature ? [slugify(feature)] : listFeatures();
  if (!features.length) {
    out('Nenhuma spec encontrada em specs/');
    return;
  }
  let failed = 0;
  for (const slug of features) {
    const r = checkFeature(slug);
    const tag = r.ok ? '✓' : '✗';
    const stages = STAGES.map(s => `${s}:${r.stages[s] || '—'}`).join(' ');
    out(`${tag} ${slug.padEnd(30)} ${stages}`);
    if (!r.ok) {
      r.errors.forEach(e => out(`    ↳ ${e}`));
      failed++;
    }
  }
  if (failed) {
    out(`\n${failed} feature(s) com problema.`);
    process.exit(1);
  }
}

function cmdSetStatus(feature, stage, status) {
  if (!feature || !stage || !status) fail('uso: spec:set-status <feature> <spec|plan|tasks> <status>');
  if (!STAGES.includes(stage)) fail(`stage inválido: ${stage}. Use: ${STAGES.join('|')}`);
  if (!VALID_STATUSES.includes(status)) fail(`status inválido: ${status}. Use: ${VALID_STATUSES.join('|')}`);
  const slug = slugify(feature);
  const file = path.join(specsDir, slug, `${stage}.md`);
  if (!fs.existsSync(file)) fail(`${stage}.md não existe em specs/${slug}/`);
  const content = fs.readFileSync(file, 'utf8');
  const m = content.match(STATUS_RE);
  const previous = m ? m[1].toLowerCase() : 'unknown';
  const updated = m
    ? content.replace(STATUS_RE, `- **Status**: ${status}`)
    : content.replace(/^# .+\n/, match => `${match}\n- **Status**: ${status}\n`);
  fs.writeFileSync(file, updated);
  out(`✓ ${slug}/${stage}.md: ${previous} → ${status}`);
}

// Só despacha quando executado como CLI. Importado (pelos testes), expõe as funções sem rodar nada.
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const [, , subcmd, ...rest] = process.argv;
  const arg = rest[0];

  switch (subcmd) {
    case 'new': cmdNew(arg); break;
    case 'plan': cmdNextStage('plan', arg); break;
    case 'tasks': cmdNextStage('tasks', arg); break;
    case 'check': cmdCheck(arg); break;
    case 'set-status': cmdSetStatus(rest[0], rest[1], rest[2]); break;
    default:
      out('Uso: spec-cli <new|plan|tasks|check|set-status> [args]');
      process.exit(1);
  }
}
