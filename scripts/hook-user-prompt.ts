#!/usr/bin/env node
/**
 * Hook UserPromptSubmit — injeção opcional de smart-context.
 *
 * Protocolo:
 * - stdin: JSON com { prompt, session_id, ... }
 * - stdout: JSON com { hookSpecificOutput: { hookEventName, additionalContext } } ou vazio
 *
 * Dois caminhos de injeção:
 * 1. Slug de spec detectado no prompt (specs/<slug>/ existe) → injeta pack
 *    task-mode montado do filesystem (spec + plan + tasks + runbook GSD).
 *    Ligado por padrão; desligue com FRAMEWORK_HOOK_INJECT=0. A economia não
 *    depende da IA obedecer a instrução: o contexto certo chega sozinho.
 * 2. TRIGGER_KEYWORDS genéricos → pack global (mission/standards/ADRs).
 *    Continua opt-in via FRAMEWORK_HOOK_INJECT=1.
 *
 * Defaults conservadores (não bloqueia, não atrasa):
 * - Limite duro de bytes (configurável em .memoryrc.json -> hooks.userPromptCap)
 * - Cache por hash do prompt em /tmp/framework-hook-cache/
 * - Sem SQLite no hot path (o Context Engineer faz FTS5 quando convocado)
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const TRIGGER_KEYWORDS = [
  'implement', 'implementa', 'implementar',
  'refator', 'refactor',
  'criar feature', 'nova feature',
  'spec:', 'plan:', 'tasks:',
  'arquitet', 'architect',
];

const DEFAULT_CAP_BYTES = 4000;

function exitSilent() {
  process.exit(0);
}

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function loadConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, '.memoryrc.json'), 'utf8'));
    return cfg.hooks || {};
  } catch { return {}; }
}

function keywordTriggered(prompt: any) {
  if (process.env.FRAMEWORK_HOOK_INJECT !== '1') return false;
  if (!prompt) return false;
  const lower = prompt.toLowerCase();
  return TRIGGER_KEYWORDS.some(kw => lower.includes(kw));
}

// Slugs de spec do framework (specs/<slug>/spec.md). Slugs curtos (<4 chars)
// ficam de fora para evitar falso positivo em palavras comuns.
function listSpecSlugs() {
  const dir = path.join(root, 'specs');
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('_') && e.name.length >= 4)
      .filter(e => fs.existsSync(path.join(dir, e.name, 'spec.md')))
      .map(e => e.name);
  } catch { return []; }
}

function detectSlug(prompt: any) {
  if (!prompt || process.env.FRAMEWORK_HOOK_INJECT === '0') return null;
  const lower = prompt.toLowerCase();
  // Slug mais longo primeiro: "forja-core-v2" ganha de "forja-core".
  const slugs = listSpecSlugs().sort((a, b) => b.length - a.length);
  return slugs.find(s => lower.includes(s)) || null;
}

function cacheKey(prompt: any) {
  return crypto.createHash('sha1').update(prompt).digest('hex').slice(0, 16);
}

function getCached(key: any) {
  const f = path.join('/tmp/framework-hook-cache', `${key}.txt`);
  if (!fs.existsSync(f)) return null;
  const stat = fs.statSync(f);
  if (Date.now() - stat.mtimeMs > 30 * 60 * 1000) return null; // 30min TTL
  return fs.readFileSync(f, 'utf8');
}

function setCached(key: any, content: any) {
  const dir = '/tmp/framework-hook-cache';
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${key}.txt`), content);
}

// Pack task-mode de uma spec: o contexto mínimo-suficiente para trabalhar
// naquela feature, sem carregar memory/ inteira.
function buildTaskContext(slug: any, capBytes: any) {
  const pieces: string[] = [];
  const candidates = [
    [`specs/${slug}/spec.md`, 4000],
    [`specs/${slug}/plan.md`, 2500],
    [`specs/${slug}/tasks.md`, 2500],
    [`.context/gsd-${slug}.md`, 1500],
  ];
  for (const [rel, sliceCap] of (candidates as [string, number][])) {
    try {
      const c = fs.readFileSync(path.join(root, rel), 'utf8');
      pieces.push(`### ${rel}\n\n${c.slice(0, sliceCap)}`);
    } catch { /* arquivo ainda não existe nesta fase do pipeline */ }
  }
  if (!pieces.length) return null;
  const header = `Spec detectada no prompt: **${slug}**. Pack task-mode injetado ` +
    `(ADR-0009). Para mais contexto: \`npm run query:universal -- "<termo>"\`.`;
  let out = `<forja-task-context slug="${slug}">\n${header}\n\n` +
    pieces.join('\n\n---\n\n') + '\n</forja-task-context>';
  if (out.length > capBytes) out = out.slice(0, capBytes) + '\n[…truncado…]';
  return out;
}

function buildContext(prompt: any, capBytes: any) {
  // Estratégia simples: cabeça das ADRs + index global. FTS5 dirigido por prompt seria ideal,
  // mas evitamos abrir SQLite no hot path do hook. O Context Engineer faz isso quando convocado.
  const pieces: string[] = [];
  const candidates = [
    'memory/00-global/mission.md',
    'memory/00-global/standards.md',
    'AGENTS.md',
    'specs/README.md',
  ];
  for (const rel of candidates) {
    try {
      const c = fs.readFileSync(path.join(root, rel), 'utf8');
      pieces.push(`### ${rel}\n\n${c}`);
    } catch { /* ignore */ }
  }
  // ADRs mais recentes
  const adrDir = path.join(root, 'memory/90-decisions');
  if (fs.existsSync(adrDir)) {
    const adrs = fs.readdirSync(adrDir).filter(f => f.match(/^\d{4}-/)).sort().slice(-3);
    for (const a of adrs) {
      try {
        const c = fs.readFileSync(path.join(adrDir, a), 'utf8');
        pieces.push(`### memory/90-decisions/${a}\n\n${c.slice(0, 800)}`);
      } catch { /* ignore */ }
    }
  }
  let out = '<framework-context>\n' + pieces.join('\n\n---\n\n') + '\n</framework-context>';
  if (out.length > capBytes) out = out.slice(0, capBytes) + '\n[…truncado…]';
  return out;
}

(function main() {
  const raw = readStdin();
  let payload: any = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch { /* tolerância */ }
  const prompt = payload.prompt || payload.user_prompt || '';

  const slug = detectSlug(prompt);
  if (!slug && !keywordTriggered(prompt)) exitSilent();

  const cfg = loadConfig();
  const cap = cfg.userPromptCap || DEFAULT_CAP_BYTES;
  const key = cacheKey(`${slug || 'kw'}:${prompt}`);
  let ctx = getCached(key);
  if (!ctx) {
    ctx = (slug && buildTaskContext(slug, cap)) || (keywordTriggered(prompt) ? buildContext(prompt, cap) : null);
    if (!ctx) exitSilent();
    setCached(key, ctx);
  }

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: ctx,
    },
  }));
})();
