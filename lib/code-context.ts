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

/**
 * Orçamento do código anexado por padrão (SPEC-057 AC-4). Uma fatia grande tem dezenas de arquivos e
 * `--code` lia todos por inteiro — janela gasta com apresentação e ORM antes de chegar na regra.
 * `--full` devolve o comportamento antigo.
 */
export const CODE_TOKEN_BUDGET = 6000;

/**
 * Camadas mais informativas primeiro: é em `domain/` que a invariante mora, e `presentation/` é a
 * camada que um agente quase sempre já sabe como é.
 */
const LAYER_ORDER = ['domain', 'application', 'infrastructure', 'presentation'];

export interface CodeFile {
  path: string;
  tokens: number;
  content: string;
}

/**
 * Caminho relativo como o pacote o mostra: com `/`. O pack é texto colado no contexto de um agente —
 * no Windows o separador nativo faria o mesmo domínio produzir dois pacotes diferentes (e quebraria
 * a igualdade que os testes de contrato dependem).
 */
function relFrom(root: string, target: string): string {
  return path.relative(root, target).split(path.sep).join('/');
}

/**
 * Ordem de leitura da fatia: quem casa com o termo vem primeiro (caminho pesa mais que conteúdo —
 * `order.entity.ts` é sobre a entidade, um arquivo que só a menciona não), desempate por camada e
 * depois por caminho, para a mesma consulta dar sempre o mesmo pacote.
 */
export function byRelevance(files: CodeFile[], terms: string[]): CodeFile[] {
  const hits = (f: CodeFile): number => {
    const rel = f.path.toLowerCase();
    const body = f.content.toLowerCase();
    return terms.reduce((acc, t) => {
      const inPath = rel.includes(t) ? 3 : 0;
      const inBody = body.split(t).length - 1;
      return acc + inPath + Math.min(inBody, 5);
    }, 0);
  };
  const layer = (f: CodeFile): number => {
    const rel = f.path.toLowerCase();
    const at = LAYER_ORDER.findIndex((l) => rel.includes(`/${l}/`));
    return at === -1 ? LAYER_ORDER.length : at;
  };
  return [...files].sort((a, b) => hits(b) - hits(a) || layer(a) - layer(b) || a.path.localeCompare(b.path));
}

/** Pega arquivos na ordem até estourar o orçamento; devolve também o que ficou de fora. */
export function withinBudget(files: CodeFile[], budget: number): { kept: CodeFile[]; omitted: CodeFile[] } {
  const kept: CodeFile[] = [];
  const omitted: CodeFile[] = [];
  let used = 0;
  for (const f of files) {
    if (used + f.tokens > budget && kept.length > 0) omitted.push(f);
    else {
      kept.push(f);
      used += f.tokens;
    }
  }
  return { kept, omitted };
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
  code: CodeFile[];
  codeTokens: number;
  /** Arquivos da fatia que o orçamento deixou de fora — sempre à mostra, nunca corte calado. */
  codeOmitted: { path: string; tokens: number }[];
  totalTokens: number;
}

/**
 * Monta o pacote de um domínio. Por padrão só o mapa (`context.md`) — o contexto barato que substitui
 * a exploração. Com `includeCode`, anexa o código da fatia — o que se lê ao *editar* — na ordem de
 * relevância e até `budget` tokens; `full: true` anexa a fatia inteira (comportamento pré-SPEC-057,
 * e o que o `token:economy` precisa para medir o custo de ler tudo).
 */
export function buildContextPack(
  {
    projectRoot,
    domain,
    includeCode = false,
    query = '',
    full = false,
    budget = CODE_TOKEN_BUDGET,
  }: { projectRoot: string; domain: string; includeCode?: boolean; query?: string; full?: boolean; budget?: number },
  env: CodeContextEnv = defaultFsEnv
): ContextPack {
  // Allowlist against the domains the project actually declares (memory/30-domains/*) — rejects early
  // rather than sanitizing, since it's information this function already has and a traversal payload
  // (e.g. "../../etc") can never literally equal one of those directory names.
  if (!domainsOf(projectRoot, env).includes(domain)) {
    return { domain, found: false, mapPath: null, map: null, mapTokens: 0, code: [], codeTokens: 0, codeOmitted: [], totalTokens: 0 };
  }

  const mapPath = path.join(projectRoot, 'memory', '30-domains', domain, 'context.md');
  let map: string | null = null;
  try {
    map = env.fs.readFileSync(mapPath, 'utf8');
  } catch {
    map = null;
  }

  const code: CodeFile[] = [];
  let codeOmitted: { path: string; tokens: number }[] = [];
  if (includeCode) {
    const files: CodeFile[] = [];
    for (const file of moduleFiles(projectRoot, domain, env)) {
      let content = '';
      try {
        content = env.fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      files.push({ path: relFrom(projectRoot, file), tokens: estimateTokens(content), content });
    }
    const ordered = byRelevance(files, query.toLowerCase().split(/\s+/).filter(Boolean));
    const cut = full ? { kept: ordered, omitted: [] } : withinBudget(ordered, budget);
    code.push(...cut.kept);
    codeOmitted = cut.omitted.map(({ path: rel, tokens }) => ({ path: rel, tokens }));
  }

  const mapTokens = map ? estimateTokens(map) : 0;
  const codeTokens = code.reduce((acc, c) => acc + c.tokens, 0);

  return {
    domain,
    found: map != null,
    mapPath: map != null ? relFrom(projectRoot, mapPath) : null,
    map,
    mapTokens,
    code,
    codeTokens,
    codeOmitted,
    totalTokens: mapTokens + codeTokens,
  };
}
