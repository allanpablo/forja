/**
 * lib/core/project-smoke.ts — o gate do projeto gerado.
 *
 * Guarda a fronteira que `release:check` não vê, um nível acima: **o gerador mente sobre o projeto**.
 * O `release:check` prova que o pacote `forjajs` instala e roda. Este prova que o que ele *gera*
 * — via `create-memory-nest-kit` — é coerente e buildar. É a mesma classe da SPEC-010, na saída.
 *
 * O gerador escreve a partir de templates. Cada substituição é uma chance de mentira silenciosa: um
 * `{{FEATURE}}` que vaza, um `package.json` que não parseia, uma estrutura de memória incompleta. O
 * princípio é o mesmo do release: **grep não prova ausência; gerar e inspecionar prova.**
 *
 * O runner é o de `checks.ts`, o mesmo do doctor e do release. Uma máquina, três fronteiras.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runChecks as run, worstStatus } from './checks.ts';
import type { Check } from './checks.ts';
// @ts-ignore — validador legado sem tipos exportados; usado só pela forma { isValid, errors }.
import { validateProjectStructure } from '../validators/structure-validator.ts';

export { worstStatus };

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');

/** Placeholders do gerador: identificadores MAIÚSCULOS entre chaves duplas (`{{FEATURE}}`). */
const PLACEHOLDER_RE = /\{\{[A-Z][A-Z0-9_]*\}\}/;

interface SmokeEnv {
  root: string;
  fs: typeof fs;
  projectDir?: string;
  full: boolean;
  spawn: (cmd: string, args: string[], opts?: any) => { stdout: string; stderr: string; code: number };
}

/**
 * Gera um projeto num diretório temporário isolado e entrega o caminho ao callback. Limpa o
 * temporário **sempre**, inclusive quando o callback lança — o mesmo contrato do `withCleanInstall`.
 */
export async function withGeneratedProject<T>(
  fn: (ctx: { projectDir: string }) => Promise<T> | T,
  { root = repoRoot, spawn }: { root?: string; spawn: SmokeEnv['spawn'] }
): Promise<T> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-smoke-'));
  const projectDir = path.join(dir, 'smoke-proj');

  try {
    const gen = path.join(root, 'bin', 'create-memory-nest-kit.ts');
    const res = spawn(process.execPath, [gen, projectDir, '--force'], { cwd: dir });
    if (res.code !== 0) {
      throw new Error(`o gerador saiu com código ${res.code}:\n${(res.stderr || res.stdout).slice(0, 800)}`);
    }
    return await fn({ projectDir });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Walk — arquivos de texto do projeto, menos node_modules
// ---------------------------------------------------------------------------

function walkFiles(env: SmokeEnv, dir: string, out: string[]): string[] {
  let entries: string[];
  try {
    entries = env.fs.readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.git') continue;
    const p = path.join(dir, entry);
    let st;
    try {
      st = env.fs.statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkFiles(env, p, out);
    else out.push(p);
  }
  return out;
}

/** Lê como texto; devolve null para binário/ilegível (não é competência deste gate). */
function readText(env: SmokeEnv, file: string): string | null {
  try {
    const buf = env.fs.readFileSync(file);
    if (buf.includes(0)) return null; // binário
    return buf.toString('utf8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

/** Se o projeto não nasceu, todo o resto é irrelevante — daí os outros dependerem deste. */
const generated: Check = {
  id: 'generated',
  title: 'o gerador produz um projeto',
  severity: 'critical',
  probe(env: SmokeEnv) {
    const marker = path.join(env.projectDir!, 'AGENTS.md');
    return env.fs.existsSync(marker)
      ? { status: 'ok', detail: `projeto gerado em ${path.basename(env.projectDir!)}`, fix: null }
      : { status: 'fail', detail: 'o gerador rodou mas não produziu AGENTS.md', fix: 'investigue create-memory-nest-kit' };
  },
};

/** O bug mais barato de introduzir e o mais visível ao usuário: um template não substituído. */
const noPlaceholders: Check = {
  id: 'no-placeholders',
  title: 'nenhum placeholder {{...}} vazou',
  severity: 'critical',
  dependsOn: 'generated',
  probe(env: SmokeEnv) {
    const leaked: string[] = [];
    for (const file of walkFiles(env, env.projectDir!, [])) {
      const src = readText(env, file);
      if (src == null) continue;
      const m = src.match(PLACEHOLDER_RE);
      if (m) leaked.push(`${path.relative(env.projectDir!, file)} → ${m[0]}`);
    }
    if (leaked.length) {
      return {
        status: 'fail',
        detail: `${leaked.length} placeholder(s) não substituído(s): ${leaked.slice(0, 3).join('; ')}`,
        fix: 'o gerador esqueceu um replace — confira o fillTemplate do gerador correspondente',
      };
    }
    return { status: 'ok', detail: 'todo template foi substituído', fix: null };
  },
};

/** `package.json` gerado que não parseia entrega um projeto morto no `npm install`. */
const jsonValid: Check = {
  id: 'json-valid',
  title: 'todo package.json gerado é JSON válido',
  severity: 'critical',
  dependsOn: 'generated',
  probe(env: SmokeEnv) {
    const broken: string[] = [];
    let total = 0;
    for (const file of walkFiles(env, env.projectDir!, [])) {
      if (path.basename(file) !== 'package.json') continue;
      total += 1;
      const src = readText(env, file);
      try {
        JSON.parse(src ?? '');
      } catch (e) {
        broken.push(`${path.relative(env.projectDir!, file)}: ${(e as Error).message}`);
      }
    }
    if (broken.length) {
      return { status: 'fail', detail: `package.json inválido: ${broken.join('; ')}`, fix: 'corrija o template do package.json no gerador' };
    }
    return { status: 'ok', detail: `${total} package.json válido(s)`, fix: null };
  },
};

/** Reusa o validador que o próprio gerador roda no fim — uma máquina, não duas (SPEC-009). */
const structure: Check = {
  id: 'structure',
  title: 'a estrutura do projeto gerado é íntegra',
  severity: 'critical',
  dependsOn: 'generated',
  probe(env: SmokeEnv) {
    const report = validateProjectStructure(env.projectDir!, { includeNest: true });
    if (!report.isValid) {
      return {
        status: 'fail',
        detail: `${report.errors.length} problema(s): ${report.errors.slice(0, 3).join('; ')}`,
        fix: 'um arquivo/diretório crítico não foi gerado — confira o gerador de estrutura',
      };
    }
    return { status: 'ok', detail: 'estrutura de memória e backend completas', fix: null };
  },
};

/**
 * O projeto gerado **herda o gate** dos mapas (ADR-0030): `scripts/check-memory-maps.mjs` viaja com
 * ele. Sem isso, a coerência mapa↔código do usuário volta a viver por disciplina. Este check prova
 * que a propagação aconteceu — o framework não só tem gates, ele os transmite.
 */
const gateInherited: Check = {
  id: 'gate-inherited',
  title: 'o projeto gerado carrega o gate dos mapas (ADR-0030)',
  severity: 'critical',
  dependsOn: 'generated',
  probe(env: SmokeEnv) {
    const gate = path.join(env.projectDir!, 'scripts', 'check-memory-maps.mjs');
    return env.fs.existsSync(gate)
      ? { status: 'ok', detail: 'scripts/check-memory-maps.mjs presente — o invariante viaja com o projeto', fix: null }
      : { status: 'fail', detail: 'o projeto gerado não trouxe o gate dos mapas', fix: 'confira o scriptTemplates do memory-generator' };
  },
};

/**
 * A prova final, e a mais cara: o backend gerado **buildar de verdade**. Só no tier `--full` —
 * `npm install` de um projeto NestJS é lento e usa rede, então roda antes de release, não a cada
 * commit. É o análogo do clean-install do `release:check`, na saída do gerador.
 */
const builds: Check = {
  id: 'builds',
  title: 'o backend gerado instala e buildar (--full)',
  severity: 'critical',
  dependsOn: 'structure',
  probe(env: SmokeEnv) {
    if (!env.full) {
      return { status: 'skipped', detail: 'tier --full desligado (custo de rede); rode com --full antes de publicar', fix: null };
    }
    const backend = path.join(env.projectDir!, 'backend');
    if (!env.fs.existsSync(path.join(backend, 'package.json'))) {
      return { status: 'skipped', detail: 'sem backend/ (projeto só-memória)', fix: null };
    }
    const install = env.spawn('npm', ['install', '--no-audit', '--no-fund'], { cwd: backend });
    if (install.code !== 0) {
      return { status: 'fail', detail: `npm install falhou no backend gerado:\n${(install.stderr || install.stdout).slice(0, 500)}`, fix: 'confira as dependências no template do package.json' };
    }
    const build = env.spawn('npm', ['run', 'build'], { cwd: backend });
    if (build.code !== 0) {
      return { status: 'fail', detail: `npm run build falhou no backend gerado:\n${(build.stderr || build.stdout).slice(0, 500)}`, fix: 'o código gerado não compila — confira os templates do nest-generator' };
    }
    return { status: 'ok', detail: 'backend gerado instala e compila', fix: null };
  },
};

/** @type {Check[]} */
export const SMOKE_CHECKS: Check[] = [generated, noPlaceholders, jsonValid, structure, gateInherited, builds];

export function defaultEnv(overrides: Partial<SmokeEnv> = {}): SmokeEnv {
  return {
    root: repoRoot,
    fs,
    full: false,
    spawn: (cmd, args, opts) => {
      // Isolamento como no release: sem NODE_PATH nem npm_config_* herdados vazando para o install.
      const env = { ...process.env };
      delete env.NODE_PATH;
      for (const key of Object.keys(env)) if (key.startsWith('npm_')) delete env[key];
      try {
        return { stdout: execFileSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', env, ...opts }), stderr: '', code: 0 };
      } catch (err) {
        const e = err as any;
        return { stdout: e.stdout || '', stderr: e.stderr || String(err), code: e.status ?? 1 };
      }
    },
    ...overrides,
  };
}

/** Gera um projeto isolado, roda os checks, limpa. */
export async function runProjectSmoke({ full = false, env: overrides = {} }: { full?: boolean; env?: Partial<SmokeEnv> } = {}) {
  const base = defaultEnv({ full, ...overrides });
  return withGeneratedProject(
    ({ projectDir }) => run({ checks: SMOKE_CHECKS, env: { ...base, projectDir } }),
    { root: base.root, spawn: base.spawn }
  );
}
