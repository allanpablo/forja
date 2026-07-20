/**
 * lib/code-context.ts — monta o pacote de contexto mínimo de um domínio (SPEC-016, ADR-0009).
 *
 * A economia de token do Forja é da memória persistente: o `context.md` (o mapa) faz um agente ir
 * direto ao agregado em vez de varrer a fatia no frio — medido em −61% pelo `token:economy`. Mas até
 * agora esse mapa era só um arquivo que alguém lembrava de ler. Este módulo o entrega como **pacote
 * pronto**: o mapa por padrão, o código da fatia sob demanda, com o custo em token à mostra.
 *
 * É o `context:smart` do eixo código — o −61% virado ferramenta, não medição.
 */

import fs from 'node:fs';
import path from 'node:path';

export interface CodeContextEnv {
  fs: typeof fs;
}

const defaultFsEnv: CodeContextEnv = { fs };

/** Tokens ≈ bytes/4 — o mesmo proxy do resto do framework. */
export function estimateTokens(text: string): number {
  return Math.round(text.length / 4);
}

/** Domínios disponíveis num projeto: os diretórios sob `memory/30-domains/`. */
export function domainsOf(projectRoot: string, env: CodeContextEnv = defaultFsEnv): string[] {
  const dir = path.join(projectRoot, 'memory', '30-domains');
  try {
    return env.fs
      .readdirSync(dir)
      .filter((e: string) => {
        try {
          return env.fs.statSync(path.join(dir, e)).isDirectory();
        } catch {
          return false;
        }
      })
      .sort();
  } catch {
    return [];
  }
}

/** Todo `.ts` sob o diretório do módulo (`backend/src/modules/<domain>/`), menos node_modules. */
function moduleFiles(projectRoot: string, domain: string, env: CodeContextEnv): string[] {
  const base = path.join(projectRoot, 'backend', 'src', 'modules', domain);
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = env.fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      if (e === 'node_modules') continue;
      const p = path.join(dir, e);
      let st;
      try {
        st = env.fs.statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(p);
      else if (e.endsWith('.ts')) out.push(p);
    }
  };
  walk(base);
  return out.sort();
}

export interface ContextPack {
  domain: string;
  found: boolean;
  mapPath: string | null;
  map: string | null;
  mapTokens: number;
  code: { path: string; tokens: number; content: string }[];
  codeTokens: number;
  totalTokens: number;
}

/**
 * Monta o pacote de um domínio. Por padrão só o mapa (`context.md`) — o contexto barato que substitui
 * a exploração. Com `includeCode`, anexa o código da fatia — o que se lê ao *editar*.
 */
export function buildContextPack(
  { projectRoot, domain, includeCode = false }: { projectRoot: string; domain: string; includeCode?: boolean },
  env: CodeContextEnv = defaultFsEnv
): ContextPack {
  const mapPath = path.join(projectRoot, 'memory', '30-domains', domain, 'context.md');
  let map: string | null = null;
  try {
    map = env.fs.readFileSync(mapPath, 'utf8');
  } catch {
    map = null;
  }

  const code: ContextPack['code'] = [];
  if (includeCode) {
    for (const file of moduleFiles(projectRoot, domain, env)) {
      let content = '';
      try {
        content = env.fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      code.push({ path: path.relative(projectRoot, file), tokens: estimateTokens(content), content });
    }
  }

  const mapTokens = map ? estimateTokens(map) : 0;
  const codeTokens = code.reduce((acc, c) => acc + c.tokens, 0);

  return {
    domain,
    found: map != null,
    mapPath: map != null ? path.relative(projectRoot, mapPath) : null,
    map,
    mapTokens,
    code,
    codeTokens,
    totalTokens: mapTokens + codeTokens,
  };
}
