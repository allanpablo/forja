/**
 * lib/core/health.mjs — saúde do núcleo do Forja.
 *
 * Fonte única de verdade sobre o que impede o framework de trabalhar. Consumida por
 * `tools:doctor` (gate, com exit code), pelo hook `SessionStart` (aviso, nunca trava) e,
 * futuramente, pelo release-auditor.
 *
 * Por que existir (SPEC-009):
 *
 * O `tools:doctor` auditava cinco ferramentas *opcionais* — sobre as quais ele mesmo dizia
 * "o fluxo nunca trava por elas" — e era cego para tudo que trava. Quando o `better-sqlite3`
 * ficou com ABI de outra major do Node, a memória universal morreu inteira: o doctor reportou
 * "2/5 ferramentas disponíveis", e o SessionStart prescreveu `npm install`, que não recompila
 * binário nativo. A correção real era `npm rebuild better-sqlite3`. Cada superfície tinha sua
 * própria heurística, e por isso uma delas pôde mentir sozinha.
 *
 * Dois princípios, que valem para qualquer check novo:
 *
 * 1. **Nunca colapsar causas distintas num booleano.** O bug original era um `catch { return
 *    null }` que engolia "sem node_modules", "ABI incompatível" e "banco ausente" no mesmo
 *    `null` — e então prescrevia a correção de apenas uma das três. Um probe classifica a causa
 *    e devolve a correção *dela*.
 * 2. **Uma causa, uma linha vermelha.** Com o ABI quebrado, os checks de memória também
 *    falhariam, e o operador veria três erros sem saber qual é a raiz. Daí `dependsOn`: check
 *    cuja dependência falhou é `skipped`, não `fail`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getWorkspaceDbPath, getWorkspaceInfo } from '../workspace.ts';
import { runChecks as run, worstStatus, stripTemplateLiterals, asErrno } from './checks.ts';
import { COMMANDS } from './registry.ts';
import { scanCommands, scanLinks, projectCommands, scanAdrRefs, adrNumbers } from './doc-graph.ts';

// Os contratos vivem em checks.mjs — importados, não redefinidos. As cópias locais eram resíduo da
// extração do runner (SPEC-010) e já divergiam.
import type { Check, Result } from './checks.ts';
/** @typedef {import('./checks.ts').Status} Status */

// O runner vive em checks.mjs e é compartilhado com o catálogo de release (SPEC-010). Re-exportado
// aqui para que `tools:doctor` e o hook SessionStart sigam importando de um lugar só.
export { worstStatus };

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');

/**
 * Ambiente injetável. Existe para que os probes sejam testáveis sem mockar o loader de módulos
 * do Node nem corromper `node_modules` de verdade — simular um ABI quebrado é passar um
 * `importModule` que lança `ERR_DLOPEN_FAILED`.
 *
 * @typedef {object} Env
 * @property {string}   root          Raiz do repo do framework.
 * @property {typeof fs} fs
 * @property {(specifier: string) => Promise<unknown>} importModule
 * @property {object}   process       Só o que os probes leem: `versions`, `env`.
 * @property {{ dbPath: () => string, info: () => object }} workspace
 */

/** @returns {Env} */
export function defaultEnv(overrides = {}) {
  return {
    root: repoRoot,
    fs,
    importModule: (specifier: any) => import(specifier),
    process: globalThis.process,
    workspace: { dbPath: getWorkspaceDbPath, info: getWorkspaceInfo },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------

/**
 * O check que teria pego a quebra de 2026-07-13.
 *
 * Importar `better-sqlite3` **não** basta: o binding nativo só é aberto no construtor — o
 * `ERR_DLOPEN_FAILED` original vinha de `new Database`, não do import. Um probe que só importasse
 * o módulo daria verde num ambiente quebrado.
 *
 * Classificamos por `err.code`, nunca pela mensagem: o texto do erro varia entre versões do Node,
 * e este check existe precisamente para sobreviver a troca de versão do Node.
 */
const nativeAbi: Check = {
  id: 'native-abi',
  title: 'better-sqlite3 carrega no Node atual',
  severity: 'critical',
  scope: 'runtime',
  async probe(env: any) {
    let Database;
    try {
      ({ default: Database } = await env.importModule('better-sqlite3'));
    } catch (err) {
      if (asErrno(err).code === 'ERR_MODULE_NOT_FOUND') {
        return {
          status: 'fail',
          detail: 'better-sqlite3 não está instalado — toda a memória universal fica indisponível',
          fix: 'npm install',
        };
      }
      throw err;
    }

    try {
      new Database(':memory:').close();
    } catch (err) {
      if (asErrno(err).code === 'ERR_DLOPEN_FAILED') {
        const node = env.process.versions.node;
        return {
          status: 'fail',
          detail:
            `binário nativo compilado para outra versão do Node (rodando v${node}). ` +
            'A memória universal está morta: query:universal, sync:universal e context:smart não funcionam. ' +
            'npm install NÃO corrige isto — ele não recompila binário nativo quando o lock já bate.',
          fix: 'npm rebuild better-sqlite3',
        };
      }
      throw err;
    }

    return { status: 'ok', detail: `carrega em Node v${env.process.versions.node}`, fix: null };
  },
};

const memoryDb: Check = {
  id: 'memory-db',
  title: 'universal.db acessível',
  severity: 'critical',
  scope: 'runtime',
  dependsOn: 'native-abi',
  async probe(env: any) {
    const dbPath = env.workspace.dbPath();

    // Ausente ≠ quebrado. Num clone novo (ou num CI) a memória simplesmente nunca foi indexada:
    // é o estado natural, não uma falha, e um comando resolve. Reprovar aqui faria o gate travar
    // por aquilo que não impede trabalho — que é como um gate deixa de ser levado a sério.
    if (!env.fs.existsSync(dbPath)) {
      return {
        status: 'warn',
        detail: `banco ainda não indexado (${dbPath}) — normal em clone novo`,
        fix: 'npm run sync:universal',
      };
    }

    // Existir não é abrir: um banco corrompido ou sem permissão dá o mesmo `existsSync` de um
    // banco saudável, e o operador merece saber qual dos dois é.
    const { default: Database } = await env.importModule('better-sqlite3');
    try {
      const db = new Database(dbPath, { readonly: true });
      const { n } = db.prepare('SELECT count(*) AS n FROM memory_nodes').get();
      db.close();
      return { status: 'ok', detail: `${n} nós indexados`, fix: null };
    } catch (err) {
      return {
        status: 'fail',
        detail: `banco existe mas não abre (${asErrno(err).code || asErrno(err).message}) — provavelmente corrompido`,
        fix: 'npm run sync:universal',
      };
    }
  },
};

/** mtime do .md mais recente sob um diretório, ignorando arquivados. */
function newestMarkdownMtime(env: any, dir: any, acc = { t: 0 }) {
  let entries;
  try {
    entries = env.fs.readdirSync(dir);
  } catch {
    return acc.t;
  }

  for (const entry of entries) {
    if (entry.startsWith('.') || entry === 'archive') continue;
    const p = path.join(dir, entry);
    let st;
    try {
      st = env.fs.statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) newestMarkdownMtime(env, p, acc);
    else if (entry.endsWith('.md') && st.mtimeMs > acc.t) acc.t = st.mtimeMs;
  }
  return acc.t;
}

/**
 * Índice defasado é a falha mais barata de corrigir e a mais cara de ignorar: `query:universal`
 * é o primeiro passo da economia de tokens (ADR-0009), então um índice velho alimenta os agentes
 * com o documento errado — sem erro, sem log, sem sintoma.
 *
 * É `warn`, não `critical`: responder sobre memória velha atrapalha, mas não impede trabalho.
 */
const memoryFresh: Check = {
  id: 'memory-fresh',
  title: 'índice em dia com memory/',
  severity: 'warn',
  scope: 'runtime',
  dependsOn: 'memory-db',
  probe(env: any) {
    const dbPath = env.workspace.dbPath();

    // `memory-db` passa com aviso quando o banco nunca foi indexado, então a cascata não nos pula:
    // um índice que não existe não pode estar defasado.
    if (!env.fs.existsSync(dbPath)) {
      return { status: 'skipped', detail: 'não há índice para comparar', fix: null };
    }

    const dbMtime = env.fs.statSync(dbPath).mtimeMs;
    const newest = newestMarkdownMtime(env, path.join(env.root, 'memory'));

    if (newest > dbMtime) {
      const horas = Math.round((newest - dbMtime) / 36e5);
      return {
        status: 'warn',
        detail:
          `memory/ mudou depois do último sync (${horas}h) — query:universal vai responder ` +
          'sobre memória velha, calado',
        fix: 'npm run sync:universal',
      };
    }

    return { status: 'ok', detail: 'índice em dia', fix: null };
  },
};

/**
 * `warn`, não `critical`: o framework trabalha sem workspace — só `project:new` e a memória de
 * produto precisam dele.
 *
 * Reporta a **origem** da resolução (FORJA_WORKSPACE / ~/.forjarc.json / default), que é metade do
 * diagnóstico: o modo de falha interessante não é "não existe", é "existe, mas não é o que você
 * pensa" — um FORJA_WORKSPACE esquecido no ambiente aponta o framework para o workspace errado, e
 * tudo parece funcionar.
 */
const workspace: Check = {
  id: 'workspace',
  title: 'workspace resolvido',
  severity: 'warn',
  scope: 'runtime',
  probe(env: any) {
    const { root, source, exists } = env.workspace.info();

    if (!exists) {
      return {
        status: 'warn',
        detail: `workspace não existe em ${root} (origem: ${source})`,
        fix: 'npm run workspace:init',
      };
    }

    return { status: 'ok', detail: `${root} (origem: ${source})`, fix: null };
  },
};

/** Compara o Node em uso com o `engines.node` declarado. Abaixo do mínimo, o resto é loteria. */
const nodeEngines: Check = {
  id: 'node-engines',
  title: 'Node dentro de engines',
  severity: 'warn',
  scope: 'runtime',
  probe(env: any) {
    const current = env.process.versions.node;
    const pkgPath = path.join(env.root, 'package.json');

    let range;
    try {
      range = JSON.parse(env.fs.readFileSync(pkgPath, 'utf8'))?.engines?.node;
    } catch {
      return { status: 'ok', detail: 'package.json sem engines — nada a comparar', fix: null };
    }
    if (!range) return { status: 'ok', detail: 'sem engines declarado', fix: null };

    // Só o caso que importa: `>=N`. Ranges mais ricos não são usados aqui, e reimplementar semver
    // para um caso que não existe seria inventar problema.
    const min = /^>=\s*(\d+)/.exec(range)?.[1];
    if (!min) return { status: 'ok', detail: `engines: ${range}`, fix: null };

    const major = Number(current.split('.')[0]);
    if (major < Number(min)) {
      return {
        status: 'warn',
        detail: `Node v${current} abaixo do declarado (engines: ${range})`,
        fix: `atualize o Node para ${min} ou superior`,
      };
    }

    return { status: 'ok', detail: `Node v${current} (engines: ${range})`, fix: null };
  },
};

// ---------------------------------------------------------------------------
// Checks de regressão do repositório (scope: repo)
//
// Convertem em gate executável dois invariantes que o ADR-0021 corrigiu à mão e que hoje podem
// reincidir sem que nada perceba. São `scope: repo` porque não fazem sentido numa instalação
// `npm i -g forjajs` — lá não há devDependencies instaladas nem .mcp.json versionado, e rodá-los
// produziria falso positivo crítico na máquina do usuário final.
// ---------------------------------------------------------------------------

/** Estamos dentro do repo do framework, e não numa instalação do pacote? */
export function isFrameworkRepo(env: any) {
  try {
    if (!env.fs.existsSync(path.join(env.root, '.git'))) return false;
    const pkg = JSON.parse(env.fs.readFileSync(path.join(env.root, 'package.json'), 'utf8'));
    return pkg.name === 'forjajs';
  } catch {
    return false;
  }
}

const IMPORT_RE = /^\s*import\s+(?:[\w*{}\n\r\t, ]+from\s+)?['"]([^'"]+)['"]/gm;

/** Pacote npm (não builtin, não relativo). `@scope/x/sub` → `@scope/x`; `x/sub` → `x`. */
function packageName(specifier: any) {
  if (specifier.startsWith('.') || specifier.startsWith('/')) return null;
  if (specifier.startsWith('node:')) return null;
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/**
 * ADR-0021 §2: dez scripts sob `files[]` importavam `better-sqlite3` estaticamente, e o pacote
 * declarava zero `dependencies`. Numa instalação limpa, metade dos comandos estourava com
 * `ERR_MODULE_NOT_FOUND` — e o `forja` sem argumentos funcionava, o que mascarava a quebra.
 *
 * Conservador de propósito: só olha import **estático** de script publicado. Import dinâmico não
 * conta (é o padrão do carregamento lazy, e lazy é justamente o que o ADR-0021 pediu).
 */
const runtimeDeps: Check = {
  id: 'runtime-deps',
  title: 'deps de runtime declaradas',
  severity: 'critical',
  scope: 'repo',
  probe(env: any) {
    if (!isFrameworkRepo(env)) {
      return { status: 'ok', detail: 'fora do repo do framework — não se aplica', fix: null };
    }

    const pkg = JSON.parse(env.fs.readFileSync(path.join(env.root, 'package.json'), 'utf8'));
    const deps = new Set(Object.keys(pkg.dependencies || {}));
    const devDeps = new Set(Object.keys(pkg.devDependencies || {}));

    // Diretórios publicados que contêm código executável.
    const published = (pkg.files || [])
      .filter((f: any) => !f.startsWith('!') && /^(bin|lib|scripts)\//.test(f))
      .map((f: any) => path.join(env.root, f.replace(/\/+$/, '')));

    const offenders = new Map();

    const walk = (dir: any) => {
      let entries;
      try {
        entries = env.fs.readdirSync(dir);
      } catch {
        return;
      }
      for (const entry of entries) {
        const p = path.join(dir, entry);
        let st;
        try {
          st = env.fs.statSync(p);
        } catch {
          continue;
        }
        if (st.isDirectory()) {
          walk(p);
          continue;
        }
        if (!/\.(mjs|js)$/.test(entry)) continue;

        // Sem apagar os template literals, os geradores acusam a si mesmos: `nest-generator.js`
        // emite `import { INestApplication } from '@nestjs/common'` dentro de crases — código que
        // ele *escreve* para o projeto gerado, não que ele importa. Como a linha começa com
        // `import`, a âncora do parser casa. Hoje passaria por sorte (`@nestjs/*` não está nas
        // devDeps); no dia em que estivesse, este check travaria o gate sem motivo.
        const src = stripTemplateLiterals(env.fs.readFileSync(p, 'utf8'));
        for (const [, specifier] of src.matchAll(IMPORT_RE)) {
          const name = packageName(specifier);
          if (!name || deps.has(name)) continue;
          if (devDeps.has(name)) {
            offenders.set(name, path.relative(env.root, p));
          }
        }
      }
    };

    published.forEach(walk);

    if (offenders.size) {
      const lista = [...offenders].map(([n, f]) => `${n} (${f})`).join(', ');
      return {
        status: 'fail',
        detail: `importado por script publicado, mas declarado em devDependencies: ${lista}`,
        fix: `npm i -S ${[...offenders.keys()].join(' ')}`,
      };
    }

    return { status: 'ok', detail: 'imports de scripts publicados estão em dependencies', fix: null };
  },
};

/**
 * ADR-0021 §1: `.mcp.json` versionado com `-p /home/apk/.../projects/forja`, uma cópia parada do
 * repo. O codegraph indexava código morto e respondia com confiança sobre ele. O path também
 * quebrava para qualquer outro contribuidor.
 */
const mcpJson: Check = {
  id: 'mcp-json',
  title: '.mcp.json sem path absoluto',
  severity: 'critical',
  scope: 'repo',
  probe(env: any) {
    if (!isFrameworkRepo(env)) {
      return { status: 'ok', detail: 'fora do repo do framework — não se aplica', fix: null };
    }

    const file = path.join(env.root, '.mcp.json');
    if (!env.fs.existsSync(file)) {
      return { status: 'ok', detail: '.mcp.json ausente — nada a validar', fix: null };
    }

    const raw = env.fs.readFileSync(file, 'utf8');
    // Um path absoluto num arquivo versionado só pode estar certo na máquina de quem escreveu.
    const hits = raw.match(/["'](\/(?:home|Users)\/[^"']+)["']/g);

    if (hits) {
      return {
        status: 'fail',
        detail: `path absoluto versionado: ${hits.join(', ')} — aponta para a máquina de quem commitou`,
        fix: 'remova o path de .mcp.json (o MCP resolve o projeto pelo rootUri do cliente)',
      };
    }

    return { status: 'ok', detail: 'sem paths absolutos', fix: null };
  },
};

// ---------------------------------------------------------------------------
// Coerência da documentação (SPEC-011, ADR-0025)
//
// O Forja é operado por agentes que executam o que a doc manda. Quando a doc e o registry divergem,
// o agente erra por obediência. Estes três checks trazem a classe "erra sem avisar" (ADR-0021) para
// a camada de instrução — a fronteira mais barata de corromper e a mais cara de perceber.
// ---------------------------------------------------------------------------

/**
 * Comando fantasma na doc faz o agente executar o que não existe e concluir que o ambiente
 * quebrou. É `critical`. A allowlist do projeto gerado é **derivada** dos geradores + boilerplates
 * (nunca literal), senão `start:dev`/`test:e2e` e afins dariam falso positivo.
 */
const docsCommands: Check = {
  id: 'docs-commands',
  title: 'comandos citados na doc existem',
  severity: 'critical',
  scope: 'repo',
  probe(env: any) {
    if (!isFrameworkRepo(env)) {
      return { status: 'ok', detail: 'fora do repo do framework — não se aplica', fix: null };
    }

    const known = new Set([...Object.keys(COMMANDS), ...projectCommands(env)]);
    const ghosts = scanCommands(env).filter((c) => !known.has(c.command));

    if (ghosts.length) {
      const amostra = ghosts.slice(0, 5).map((g) => `${g.command} (${g.file}:${g.line})`).join(', ');
      return {
        status: 'fail',
        detail: `${ghosts.length} citação(ões) de comando inexistente: ${amostra}`,
        fix: 'renomeie para um comando do registry ou remova a citação no arquivo:linha indicado',
      };
    }

    return { status: 'ok', detail: 'toda citação de comando resolve no registry', fix: null };
  },
};

/**
 * Capacidade que ninguém documenta é capacidade obscura. `warn`, não `critical`: um comando
 * não-documentado atrapalha (o operador não sabe que existe), mas não impede trabalho.
 */
const commandsDocumented: Check = {
  id: 'commands-documented',
  title: 'todo comando do registry é documentado',
  severity: 'warn',
  scope: 'repo',
  probe(env: any) {
    if (!isFrameworkRepo(env)) {
      return { status: 'ok', detail: 'fora do repo do framework — não se aplica', fix: null };
    }

    const citados = new Set(scanCommands(env).map((c) => c.command));
    const orfaos = Object.keys(COMMANDS).filter((c) => !citados.has(c));

    if (orfaos.length) {
      return {
        status: 'warn',
        detail: `${orfaos.length} comando(s) do registry sem menção em doc/prompt/agente: ${orfaos.join(', ')}`,
        fix: 'documente cada um numa superfície de instrução, ou remova do registry se morto',
      };
    }

    return { status: 'ok', detail: 'todos os comandos do registry aparecem na doc', fix: null };
  },
};

/** Link relativo para o nada é step obscuro. `warn`: atrapalha a navegação, não impede trabalho. */
const docsLinks: Check = {
  id: 'docs-links',
  title: 'links relativos da doc resolvem',
  severity: 'warn',
  scope: 'repo',
  probe(env: any) {
    if (!isFrameworkRepo(env)) {
      return { status: 'ok', detail: 'fora do repo do framework — não se aplica', fix: null };
    }

    const quebrados = scanLinks(env).filter(
      (l) => !env.fs.existsSync(path.join(env.root, l.resolved))
    );

    if (quebrados.length) {
      const amostra = quebrados.slice(0, 5).map((q) => `${q.target} (${q.file}:${q.line})`).join(', ');
      return {
        status: 'warn',
        detail: `${quebrados.length} link(s) relativo(s) sem alvo: ${amostra}`,
        fix: 'crie o alvo ou corrija o link no arquivo:linha indicado',
      };
    }

    return { status: 'ok', detail: 'todo link relativo resolve', fix: null };
  },
};

/**
 * Referência a decisão que não existe é trilha que apodrece. Uma spec ou doc cita `ADR-0026`, o ADR
 * nunca foi escrito (ou foi renumerado), e o paper trail mente em silêncio. `warn`, não `critical`:
 * confunde o registro, não impede o framework de trabalhar — mesma família de `docs-links`.
 */
const adrRefs: Check = {
  id: 'adr-refs',
  title: 'toda citação ADR-NNNN aponta para um ADR existente',
  severity: 'warn',
  scope: 'repo',
  probe(env: any) {
    if (!isFrameworkRepo(env)) {
      return { status: 'ok', detail: 'fora do repo do framework — não se aplica', fix: null };
    }

    const existing = adrNumbers(env);
    const dangling = scanAdrRefs(env).filter((r) => !existing.has(r.num));

    if (dangling.length) {
      const amostra = dangling.slice(0, 5).map((d) => `${d.ref} (${d.file}:${d.line})`).join(', ');
      return {
        status: 'warn',
        detail: `${dangling.length} citação(ões) de ADR inexistente: ${amostra}`,
        fix: 'escreva o ADR referenciado ou corrija o número no arquivo:linha indicado',
      };
    }

    return { status: 'ok', detail: `toda referência a ADR resolve (${existing.size} ADRs)`, fix: null };
  },
};

/** @type {Check[]} */
export const CHECKS = [
  nativeAbi,
  memoryDb,
  memoryFresh,
  workspace,
  nodeEngines,
  runtimeDeps,
  mcpJson,
  docsCommands,
  commandsDocumented,
  docsLinks,
  adrRefs,
];

/**
 * Roda os checks do núcleo. Fachada sobre o runner de `checks.mjs`: existe só para injetar o
 * `defaultEnv` do framework, que o runner genérico não conhece nem deve conhecer.
 *
 * `scope: 'runtime'` roda só os checks baratos e portáveis — é o que o hook SessionStart usa, onde
 * há orçamento de 5s e nenhuma tolerância a travar a sessão.
 *
 * @param {{ scope?: import('./checks.ts').Scope|'all', env?: Partial<Env>, checks?: Check[] }} [opts]
 * @returns {Promise<Result[]>}
 */
export async function runChecks(
  opts: {
    scope?: import('./checks.ts').Scope | 'all';
    env?: any;
    checks?: import('./checks.ts').Check[];
  } = {}
) {
  const { scope = 'all', checks = CHECKS } = opts;
  return run({ checks, scope, env: defaultEnv(opts.env) });
}
