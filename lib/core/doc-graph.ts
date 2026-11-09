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
import { fileURLToPath } from 'node:url';

function portablePath(value: string): string { return value.replaceAll(path.sep, '/'); }

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
  'README.pt-BR.md',
  'README.en.md',
  'DOC-MAP.md',
];

const EXCLUDED_DIRS = new Set(['archive', 'node_modules']);

/** Um comando do Forja: `forja x:y` ou `npm run x:y`, com ao menos um `:` (o discriminador, §D4). */
const COMMAND_RE = /(?:\bforja\s+|npm run\s+)([a-z][a-z0-9]*(?::[a-z0-9-]+)+)/g;

/** Link markdown relativo. Ignora http(s):// e âncoras puras; a âncora de um path é descartada. */
const LINK_RE = /\]\(([^)]+)\)/g;

function safeRead(env: any, file: any) {
  try {
    return env.fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/** Coleta os `.md` sob uma superfície (arquivo direto ou diretório varrido, menos EXCLUDED_DIRS). */
function collectMarkdown(env: any, surface: any) {
  const abs = path.join(env.root, surface);
  const out: string[] = [];

  const walk = (p: any) => {
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
export function docFiles(env: any) {
  const seen = new Set<string>();
  for (const surface of DOC_SURFACES) {
    for (const file of collectMarkdown(env, surface)) {
      seen.add(portablePath(path.relative(env.root, file)));
    }
  }
  return [...seen];
}

/**
 * Comandos citados nas superfícies de instrução.
 * @returns {{ file: string, line: number, command: string }[]}
 */
export function scanCommands(env: any) {
  const hits: { file: string; line: number; command: string }[] = [];
  for (const rel of docFiles(env)) {
    const src = safeRead(env, path.join(env.root, rel));
    if (src == null) continue;
    const lines = src.split('\n');
    lines.forEach((text: any, i: any) => {
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
export function scanLinks(env: any) {
  const hits: { file: string; line: number; target: string; resolved: string }[] = [];
  for (const rel of docFiles(env)) {
    const src = safeRead(env, path.join(env.root, rel));
    if (src == null) continue;
    const dir = path.dirname(rel);
    const lines = src.split('\n');
    lines.forEach((text: any, i: any) => {
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
          resolved: portablePath(path.normalize(path.join(dir, target))),
        });
      }
    });
  }
  return hits;
}

/**
 * Um comando SEM dois-pontos (ex.: `orchestrate`) nunca casa com COMMAND_RE — o `:` é o
 * discriminador que evita prosa virar falso positivo. Para um nome JÁ CONHECIDO do registry, porém,
 * procurar `forja <cmd>` literal é preciso. É o fallback do `commands-documented` para esses casos.
 */
export function commandCited(env: any, cmd: string): boolean {
  const re = new RegExp(`(?:\\bforja\\s+|npm run\\s+)${cmd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  for (const rel of docFiles(env)) {
    const src = safeRead(env, path.join(env.root, rel));
    if (src != null && re.test(src)) return true;
  }
  return false;
}

/** Superfícies onde um ADR pode ser citado: as de instrução + as specs + os próprios ADRs. */
const ADR_REF_SURFACES = [...DOC_SURFACES, 'specs', 'memory/90-decisions'];
const ADR_REF_RE = /ADR-(\d{4})/g;

/** Números de ADR que existem de fato como arquivo (`NNNN-*.md`, sem `_template`). */
export function adrNumbers(env: any): Set<string> {
  const dir = path.join(env.root, 'memory', '90-decisions');
  const out = new Set<string>();
  let entries: string[];
  try {
    entries = env.fs.readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const m = e.match(/^(\d{4})-.*\.md$/);
    if (m) out.add(m[1]);
  }
  return out;
}

/**
 * Toda citação `ADR-NNNN` nas superfícies de instrução, specs e ADRs. É o `scanLinks` das
 * referências arquiteturais: um número que não existe é uma referência pendurada — trilha que apodrece.
 * @returns {{ file: string, line: number, ref: string, num: string }[]}
 */
export function scanAdrRefs(env: any) {
  const hits: { file: string; line: number; ref: string; num: string }[] = [];
  const seen = new Set<string>();
  for (const surface of ADR_REF_SURFACES) {
    for (const file of collectMarkdown(env, surface)) {
      const rel = portablePath(path.relative(env.root, file));
      if (seen.has(rel)) continue;
      seen.add(rel);
      const src = safeRead(env, file);
      if (src == null) continue;
      src.split('\n').forEach((text: any, i: any) => {
        for (const m of text.matchAll(ADR_REF_RE)) {
          hits.push({ file: rel, line: i + 1, ref: m[0], num: m[1] });
        }
      });
    }
  }
  return hits;
}

/** Extrai as keys de todo bloco `"scripts": { … }` de um fonte de gerador. */
function scriptKeys(source: any) {
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
function findPackageJsons(env: any, dir: any, acc: string[] = []) {
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
export function projectCommands(env: any) {
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
    root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'),
    fs,
    ...overrides,
  };
}

/**
 * Flag CLI: `--long` ou `-h`. Duas restrições de propósito:
 * - lookbehind (e não classe de chars) para pegar `[--ai <lista>]` dentro de um usage;
 * - traço simples só casa com UMA letra — senão o pronome clítico do português ("consultá-lo",
 *   "rode-o") vira flag `-lo`/`-o`.
 */
const FLAG_RE = /(?<![A-Za-z0-9_-])(--[a-z][a-z0-9-]*|-[a-z])(?![a-z0-9-])/g;
const SKILL_COUNT_RE = /(\d+)[ \t]+skills?\b/gi;

/**
 * Tokens de flag de um trecho (`usage` do registry, linha de doc). Único tokenizer de flags do
 * framework: quem precisa dos índices usa `scanFlags`; quem precisa só do conjunto chama isto.
 */
export function flagTokens(text: string): string[] {
  return [...text.matchAll(FLAG_RE)].map((m) => m[1]);
}

/** Citação de comando sem o prefixo `forja`/`npm run` — contexto da linha, nunca dono de flag. */
const MENTION_RE = /\b([a-z][a-z0-9]*(?::[a-z0-9-]+)+)\b/g;

/** Corta o comentário de fim de linha — ali a prosa fala, não documenta uso. */
function executablePart(line: string): string {
  const at = line.search(/\s#/);
  return at === -1 ? line : line.slice(0, at);
}

/**
 * Flags citadas junto de uma *invocação* de comando do Forja nas superfícies de instrução.
 *
 * Duas decisões que valem o comentário:
 * - **Dono = última invocação prefixada antes da flag** (`forja x:y`, `npm run x:y`). Citação sem
 *   prefixo não é invocação: na prosa ("`llm:run --profile claude` → `claude -p …`") a flag pertence
 *   ao binário do provedor, e atribuí-la ao Forja é falso positivo.
 * - **`mentions` devolve toda citação da linha**, com ou sem prefixo, para o check poder absolver a
 *   flag que a linha atribui a outro comando do Forja ("Lista os boilerplates (project:new
 *   --template)" na célula de `project:templates`).
 *
 * Comentário de fim de linha é cortado: ali a prosa cita flag de *outro* comando.
 *
 * Leitura pura — quem decide se a flag existe é o check `docs-flags`, contra o registry.
 * @returns {{ file: string, line: number, command: string, flag: string, mentions: string[] }[]}
 */
export function scanFlags(env: any) {
  const hits: { file: string; line: number; command: string; flag: string; mentions: string[] }[] = [];
  for (const rel of docFiles(env)) {
    const src = safeRead(env, path.join(env.root, rel));
    if (src == null) continue;
    src.split('\n').forEach((raw: any, i: any) => {
      const text = executablePart(String(raw));
      const invoked: { at: number; name: string }[] = [];
      for (const m of text.matchAll(COMMAND_RE)) invoked.push({ at: m.index ?? 0, name: m[1] });
      if (invoked.length === 0) return;
      const mentions = [...new Set([...text.matchAll(MENTION_RE)].map((m) => m[1]))];
      for (const m of text.matchAll(FLAG_RE)) {
        const at = m.index ?? 0;
        const owner = [...invoked].reverse().find((c) => c.at < at);
        if (!owner) continue;
        hits.push({ file: rel, line: i + 1, command: owner.name, flag: m[1], mentions });
      }
    });
  }
  return hits;
}

/**
 * Contagens de skills afirmadas na doc (`# 34 skills …`), para comparar com as pastas reais de
 * `templates/project/skills/`. Leitura pura — o juízo é do check `docs-skills-count`.
 * @returns {{ file: string, line: number, claimed: number }[]}
 */
export function scanSkillCounts(env: any) {
  const hits: { file: string; line: number; claimed: number }[] = [];
  for (const rel of docFiles(env)) {
    const src = safeRead(env, path.join(env.root, rel));
    if (src == null) continue;
    src.split('\n').forEach((text: any, i: any) => {
      for (const m of String(text).matchAll(SKILL_COUNT_RE)) {
        hits.push({ file: rel, line: i + 1, claimed: Number(m[1]) });
      }
    });
  }
  return hits;
}
