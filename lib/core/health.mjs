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

import { getWorkspaceDbPath, getWorkspaceInfo } from '../workspace.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');

/** @typedef {'critical'|'warn'} Severity */
/** @typedef {'runtime'|'repo'} Scope */
/** @typedef {'ok'|'warn'|'fail'|'skipped'} Status */

/**
 * @typedef {object} Check
 * @property {string}   id
 * @property {string}   title
 * @property {Severity} severity   `critical` trava o gate; `warn` informa.
 * @property {Scope}    scope      `repo` só roda dentro do repo do framework.
 * @property {string=}  dependsOn  Id de outro check. Se ele falhar, este vira `skipped`.
 * @property {(env: Env) => Promise<Probe>|Probe} probe
 */

/**
 * @typedef {object} Probe
 * @property {Status}       status
 * @property {string}       detail  O que foi observado, em uma linha.
 * @property {string|null=} fix     Comando exato que corrige. `null` quando não há o que corrigir.
 */

/** @typedef {{ id, title, severity: Severity, scope: Scope, status: Status, detail: string, fix: string|null }} Result */

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
    importModule: (specifier) => import(specifier),
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
const nativeAbi = {
  id: 'native-abi',
  title: 'better-sqlite3 carrega no Node atual',
  severity: 'critical',
  scope: 'runtime',
  async probe(env) {
    let Database;
    try {
      ({ default: Database } = await env.importModule('better-sqlite3'));
    } catch (err) {
      if (err?.code === 'ERR_MODULE_NOT_FOUND') {
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
      if (err?.code === 'ERR_DLOPEN_FAILED') {
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

const memoryDb = {
  id: 'memory-db',
  title: 'universal.db acessível',
  severity: 'critical',
  scope: 'runtime',
  dependsOn: 'native-abi',
  async probe(env) {
    const dbPath = env.workspace.dbPath();

    if (!env.fs.existsSync(dbPath)) {
      return {
        status: 'fail',
        detail: `banco ausente em ${dbPath} — nunca foi indexado`,
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
        detail: `banco existe mas não abre (${err?.code || err?.message}) — provavelmente corrompido`,
        fix: 'npm run sync:universal',
      };
    }
  },
};

/** mtime do .md mais recente sob um diretório, ignorando arquivados. */
function newestMarkdownMtime(env, dir, acc = { t: 0 }) {
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
const memoryFresh = {
  id: 'memory-fresh',
  title: 'índice em dia com memory/',
  severity: 'warn',
  scope: 'runtime',
  dependsOn: 'memory-db',
  probe(env) {
    const dbPath = env.workspace.dbPath();
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
const workspace = {
  id: 'workspace',
  title: 'workspace resolvido',
  severity: 'warn',
  scope: 'runtime',
  probe(env) {
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
const nodeEngines = {
  id: 'node-engines',
  title: 'Node dentro de engines',
  severity: 'warn',
  scope: 'runtime',
  probe(env) {
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
export function isFrameworkRepo(env) {
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
function packageName(specifier) {
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
const runtimeDeps = {
  id: 'runtime-deps',
  title: 'deps de runtime declaradas',
  severity: 'critical',
  scope: 'repo',
  probe(env) {
    if (!isFrameworkRepo(env)) {
      return { status: 'ok', detail: 'fora do repo do framework — não se aplica', fix: null };
    }

    const pkg = JSON.parse(env.fs.readFileSync(path.join(env.root, 'package.json'), 'utf8'));
    const deps = new Set(Object.keys(pkg.dependencies || {}));
    const devDeps = new Set(Object.keys(pkg.devDependencies || {}));

    // Diretórios publicados que contêm código executável.
    const published = (pkg.files || [])
      .filter((f) => !f.startsWith('!') && /^(bin|lib|scripts)\//.test(f))
      .map((f) => path.join(env.root, f.replace(/\/+$/, '')));

    const offenders = new Map();

    const walk = (dir) => {
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

        const src = env.fs.readFileSync(p, 'utf8');
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
const mcpJson = {
  id: 'mcp-json',
  title: '.mcp.json sem path absoluto',
  severity: 'critical',
  scope: 'repo',
  probe(env) {
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

/** @type {Check[]} */
export const CHECKS = [nativeAbi, memoryDb, memoryFresh, workspace, nodeEngines, runtimeDeps, mcpJson];

const SEVERITY_FALLBACK = 'critical';

/**
 * Um probe que estoura é pior que probe nenhum: derrubaria o diagnóstico justamente no ambiente
 * quebrado que ele existe para diagnosticar. O runner blinda cada um e segue para o próximo.
 */
async function runProbe(check, env) {
  try {
    const probe = await check.probe(env);
    return {
      status: probe.status,
      detail: probe.detail,
      fix: probe.fix ?? null,
    };
  } catch (err) {
    return {
      status: 'fail',
      detail: `probe falhou: ${err?.message || err}`,
      fix: null,
    };
  }
}

/**
 * Executa os checks na ordem declarada em CHECKS.
 *
 * `scope: 'runtime'` roda só os checks baratos e portáveis — é o que o hook SessionStart usa,
 * onde há orçamento de 5s e nenhuma tolerância a travar a sessão.
 *
 * @param {{ scope?: Scope|'all', env?: Partial<Env>, checks?: Check[] }} [opts]
 * @returns {Promise<Result[]>}
 */
export async function runChecks(opts = {}) {
  const { scope = 'all', checks = CHECKS } = opts;
  const env = defaultEnv(opts.env);

  const selected = checks.filter((c) => scope === 'all' || c.scope === scope);
  const statusById = new Map();
  const results = [];

  for (const check of selected) {
    const base = {
      id: check.id,
      title: check.title,
      severity: check.severity || SEVERITY_FALLBACK,
      scope: check.scope,
    };

    // Cascata: sem a dependência de pé, este probe não tem o que observar. Reportar `fail` aqui
    // multiplicaria uma causa em várias linhas vermelhas e esconderia a raiz.
    //
    // Propaga por cadeia, não só um nível: `skipped` conta como "não verificado" para quem depende
    // dele. Com o ABI quebrado, memory-db é skipped — e memory-fresh, que depende de memory-db,
    // igualmente não tem o que observar.
    const depStatus = check.dependsOn ? statusById.get(check.dependsOn) : null;
    if (depStatus === 'fail' || depStatus === 'skipped') {
      const motivo = depStatus === 'fail' ? 'que falhou' : 'que não foi verificado';
      results.push({
        ...base,
        status: 'skipped',
        detail: `não verificado: depende de "${check.dependsOn}", ${motivo}`,
        fix: null,
      });
      statusById.set(check.id, 'skipped');
      continue;
    }

    const probe = await runProbe(check, env);
    statusById.set(check.id, probe.status);
    results.push({ ...base, ...probe });
  }

  return results;
}

/**
 * Veredito agregado. Só `critical` reprova — um gate que trava por aquilo que não impede
 * trabalho é um gate que se aprende a ignorar.
 *
 * @param {Result[]} results
 * @returns {'ok'|'warn'|'fail'}
 */
export function worstStatus(results) {
  let seenWarn = false;

  for (const r of results) {
    if (r.status === 'fail' && r.severity === 'critical') return 'fail';
    if (r.status === 'fail' || r.status === 'warn') seenWarn = true;
  }

  return seenWarn ? 'warn' : 'ok';
}
