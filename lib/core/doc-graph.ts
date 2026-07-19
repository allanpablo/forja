/**
 * lib/core/doc-graph.mjs — a documentação lida como dado.
 *
 * O `health.mjs` já lê código (imports, package.json, .mcp.json). Este módulo lê os `.md` que
 * **instruem** o agente e extrai o que é verificável contra o código: comandos citados e links
 * relativos. Leitura pura — nenhum juízo de severidade mora aqui; os checks de `health.mjs` é que
 * julgam (SPEC-011, ADR-0025).
 *
 * Por que existir: o Forja é operado por agentes que executam o que a doc manda. Quando a doc e o
 * registry divergem, o agente não erra por burrice — erra por obediência. Em 2026-07-14 uma
 * auditoria manual achou quatro comandos fantasma no doc que ensina a economia de tokens. Nada
 * quebrou um teste. É a classe do ADR-0021 — erra sem avisar — na camada de instrução.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Superfícies de instrução. Escaneia o que orienta o agente **agora** — não o histórico.
 *
 * Fora de propósito (plano §D3): `docs/archive/` (legado), `boilerplates/` (conteúdo do projeto
 * gerado — cita comandos do projeto, não do Forja), `specs/` e `memory/` (registro histórico: uma
 * spec ou ADR pode legitimamente citar um comando proposto ou já removido).
 */
export const DOC_SURFACES = [
  'docs',
  'prompts',
  '.claude/agents',
  'AGENTS.md',
  'CLAUDE.md',
  'README.md',
  'README.en.md',
  'DOC-MAP.md',
];

const EXCLUDED_DIRS = new Set(['archive', 'node_modules']);

/** Um comando do Forja: `forja x:y` ou `npm run x:y`, com ao menos um `:` (o discriminador, §D4). */
const COMMAND_RE = /(?:\bforja\s+|npm run\s+)([a-z][a-z0-9]*(?::[a-z0-9-]+)+)/g;

/** Link markdown relativo. Ignora http(s):// e âncoras puras; a âncora de um path é descartada. */
const LINK_RE = /\]\(([^)]+)\)/g;

function safeRead(env, file) {
  try {
    return env.fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/** Coleta os `.md` sob uma superfície (arquivo direto ou diretório varrido, menos EXCLUDED_DIRS). */
function collectMarkdown(env, surface) {
  const abs = path.join(env.root, surface);
  const out: string[] = [];

  const walk = (p) => {
    let st;
    try {
      st = env.fs.statSync(p);
    } catch {
      return;
    }
    if (st.isDirectory()) {
      let entries;
      try {
        entries = env.fs.readdirSync(p);
      } catch {
        return;
      }
      for (const entry of entries) {
        if (EXCLUDED_DIRS.has(entry)) continue;
        walk(path.join(p, entry));
      }
    } else if (p.endsWith('.md')) {
      out.push(p);
    }
  };

  walk(abs);
  return out;
}

/** Todos os `.md` das superfícies de instrução, caminhos relativos à raiz. */
export function docFiles(env) {
  const seen = new Set<string>();
  for (const surface of DOC_SURFACES) {
    for (const file of collectMarkdown(env, surface)) {
      seen.add(path.relative(env.root, file));
    }
  }
  return [...seen];
}

/**
 * Comandos citados nas superfícies de instrução.
 * @returns {{ file: string, line: number, command: string }[]}
 */
export function scanCommands(env) {
  const hits: { file: string; line: number; command: string }[] = [];
  for (const rel of docFiles(env)) {
    const src = safeRead(env, path.join(env.root, rel));
    if (src == null) continue;
    const lines = src.split('\n');
    lines.forEach((text, i) => {
      for (const m of text.matchAll(COMMAND_RE)) {
        hits.push({ file: rel, line: i + 1, command: m[1] });
      }
    });
  }
  return hits;
}

/**
 * Links markdown relativos nas superfícies de instrução, com o alvo já resolvido à raiz.
 * @returns {{ file: string, line: number, target: string, resolved: string }[]}
 */
export function scanLinks(env) {
  const hits: { file: string; line: number; target: string; resolved: string }[] = [];
  for (const rel of docFiles(env)) {
    const src = safeRead(env, path.join(env.root, rel));
    if (src == null) continue;
    const dir = path.dirname(rel);
    const lines = src.split('\n');
    lines.forEach((text, i) => {
      for (const m of text.matchAll(LINK_RE)) {
        const raw = m[1].trim();
        if (!raw || raw.startsWith('#')) continue; // âncora pura
        if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) continue; // http:, mailto:, etc. — externo
        const target = raw.split('#')[0]; // descarta âncora do path
        if (!target) continue;
        hits.push({
          file: rel,
          line: i + 1,
          target,
          resolved: path.normalize(path.join(dir, target)),
        });
      }
    });
  }
  return hits;
}

/** Extrai as keys de todo bloco `"scripts": { … }` de um fonte de gerador. */
function scriptKeys(source) {
  const keys = new Set();
  const block = source.match(/"scripts"\s*:\s*\{([\s\S]*?)\}/g);
  if (!block) return keys;
  for (const b of block) {
    for (const m of b.matchAll(/"([a-z][a-z0-9]*(?::[a-z0-9-]+)+)"\s*:/g)) {
      keys.add(m[1]);
    }
  }
  return keys;
}

/** Todo `package.json` sob um diretório (boilerplates têm vários, aninhados). */
function findPackageJsons(env, dir, acc: string[] = []) {
  let entries;
  try {
    entries = env.fs.readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry)) continue;
    const p = path.join(dir, entry);
    let st;
    try {
      st = env.fs.statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) findPackageJsons(env, p, acc);
    else if (entry === 'package.json') acc.push(p);
  }
  return acc;
}

/**
 * Allowlist **derivada** dos comandos que pertencem ao projeto que o Forja *gera* (`start:dev`,
 * `test:cov`, `test:e2e`, `memory:db:*`), não ao Forja. Nunca uma lista literal — uma lista manual
 * mente no primeiro comando novo do boilerplate (a lição do `.gitignore`, SPEC-009).
 *
 * Duas fontes, porque o projeto gerado tem duas: os `"scripts"` inline que os **geradores** escrevem
 * e os `package.json` dos **boilerplates**. Derivar de só uma delas produz falso positivo na outra —
 * foi `test:e2e` (vive no boilerplate, não no gerador) que revelou isso.
 *
 * @returns {Set<string>}
 */
export function projectCommands(env) {
  const commands = new Set();

  // Fonte 1: blocos "scripts" inline dos geradores.
  const genDir = path.join(env.root, 'lib', 'generators');
  let genEntries = [];
  try {
    genEntries = env.fs.readdirSync(genDir);
  } catch {
    /* sem geradores — segue */
  }
  for (const entry of genEntries) {
    if (!/\.(mjs|cjs|js|ts)$/.test(entry)) continue;
    const src = safeRead(env, path.join(genDir, entry));
    if (src == null) continue;
    for (const key of scriptKeys(src)) commands.add(key);
  }

  // Fonte 2: package.json dos boilerplates.
  for (const pkgPath of findPackageJsons(env, path.join(env.root, 'boilerplates'))) {
    const src = safeRead(env, pkgPath);
    if (src == null) continue;
    try {
      const scripts = JSON.parse(src).scripts || {};
      for (const key of Object.keys(scripts)) commands.add(key);
    } catch {
      /* package.json inválido no boilerplate — ignora */
    }
  }

  return commands;
}

/** Ambiente padrão para uso fora do runner de checks (o CLI, testes de integração). */
export function defaultEnv(overrides = {}) {
  return {
    root: path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..'),
    fs,
    ...overrides,
  };
}
