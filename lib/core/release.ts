/**
 * lib/core/release.mjs — o gate do tarball.
 *
 * Guarda a fronteira que `health.mjs` não vê: **o repositório mente sobre o pacote**. No repo tudo
 * resolve — `node_modules` tem as devDeps, todo arquivo está presente, o `cwd` é a raiz. Nada disso
 * vale para quem roda `npm i -g forjajs`. Essa fronteira já cedeu três vezes (SPEC-010):
 *
 *   ADR-0021  `better-sqlite3` como devDependency → dez comandos com ERR_MODULE_NOT_FOUND na
 *             instalação limpa. O `forja` sem argumentos funcionava, o que mascarava a quebra.
 *   v1.1.1    `otplib` e `qrcode` publicados sem jamais existirem no git — `npm publish` empacota o
 *             disco, não o commit.
 *   v1.1.3    `docs/dashboard.md` e o script publicados sem a pasta `dashboard/`.
 *
 * O princípio que organiza tudo aqui: **grep não prova ausência; instalação prova.** Por isso o
 * gate empacota e instala de verdade, e por isso ele é lento — e tudo bem ser lento, porque roda
 * antes de publicar, não a cada commit.
 *
 * O runner é o de `checks.mjs`, o mesmo do doctor. Uma máquina, duas fronteiras.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runChecks as run, worstStatus, stripTemplateLiterals } from './checks.ts';

/** @typedef {import('./checks.ts').Check} Check */
import { COMMANDS, resolveScript } from './registry.ts';

export { worstStatus };

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');

/** Assinaturas de tarball quebrado. Exit code não serve — ver `smokeCommands`. */
const LOADER_ERRORS = /ERR_MODULE_NOT_FOUND|ERR_DLOPEN_FAILED|Cannot find module|ERR_PACKAGE_PATH_NOT_EXPORTED/;

function git(args, cwd = repoRoot) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

/**
 * Empacota o repo e instala o tarball num diretório temporário isolado.
 *
 * Isolamento importa: um gate que enxerga o `node_modules` do repo mente verde. É justamente o
 * `NODE_PATH` herdado e o `node_modules` vizinho que fariam um `import` quebrado resolver mesmo
 * assim — e a quebra só apareceria na máquina do usuário.
 *
 * Limpa o temporário **sempre**, inclusive quando o callback lança.
 *
 * @template T
 * @param {(ctx: { pkgDir: string, installDir: string }) => Promise<T>|T} fn
 * @returns {Promise<T>}
 */
export async function withCleanInstall(fn, { root = repoRoot } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-release-'));

  // Isolamento de verdade — e ele vaza por onde não se espera.
  //
  // `NODE_PATH` é o óbvio. O traiçoeiro é o `npm_config_*`: quando o gate roda de dentro de um
  // script npm (e o `prepublishOnly` é exatamente isso), o npm injeta dezenas dessas variáveis no
  // ambiente. Elas carregam o `local_prefix` do repo e, sob `npm publish --dry-run`, um
  // `npm_config_dry_run=true` que faz o `npm install` interno não instalar nada.
  //
  // Sem esta limpeza, o gate passa localmente e quebra justamente no `prepublishOnly` — o único
  // lugar onde ele precisa funcionar.
  const env = { ...process.env };
  delete env.NODE_PATH;
  for (const key of Object.keys(env)) {
    if (key.startsWith('npm_')) delete env[key];
  }

  const npm = (args, cwd) => {
    try {
      return execFileSync('npm', args, { cwd, encoding: 'utf8', env, stdio: 'pipe' });
    } catch (err) {
      // Engolir o stderr aqui cega o diagnóstico exatamente quando ele importa.
      const e = /** @type {any} */ (err);
      const saida = `${e.stdout || ''}${e.stderr || ''}`.trim();
      throw new Error(`npm ${args[0]} falhou em ${cwd}:\n${saida || e.message}`);
    }
  };

  try {
    // Antes de empacotar: se o pacote publica dist/ (SPEC-012 Fase 3), constrói o dist/ agora.
    //
    // `npm publish` empacota o disco, e o disco só tem dist/ depois do `tsc`. Buildar aqui deixa o
    // gate self-contained: a mesma prova roda no prepublishOnly e no CI sem um step de build
    // separado que alguém possa esquecer — e sem acoplar a prova a uma edição do workflow. Se o
    // build falha (erro de tipo), o `npm` abaixo lança com o stderr do tsc e o gate reprova claro.
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const shipsDist = (manifest.files || []).some((f) => f.replace(/\/+$/, '') === 'dist');
    if (shipsDist && manifest.scripts?.build) npm(['run', 'build'], root);

    const tgz = npm(['pack', '--silent', '--pack-destination', dir], root)
      .trim()
      .split('\n')
      .pop();
    if (!tgz) throw new Error('npm pack não produziu um tarball');

    npm(['init', '-y'], dir);
    npm(['install', path.join(dir, tgz)], dir);

    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const pkgDir = path.join(dir, 'node_modules', pkg.name);

    return await fn({ pkgDir, installDir: dir });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

/**
 * A falha da v1.1.1, e a única que nenhuma instalação pega: `npm publish` empacota o **disco**, não
 * o commit. Um `npm install` casual entre a auditoria e o publish reescreve o `package.json`, e foi
 * assim que `otplib` e `qrcode` chegaram ao npm sem jamais existirem no git.
 *
 * Severidade depende do modo: sob `--publish` é fatal; em dev é aviso — um gate que reprova todo
 * desenvolvimento local é um gate que se contorna (a lição que o CI nos deu na SPEC-009).
 */
/** @type {Check} */
const treeClean = {
  id: 'tree-clean',
  title: 'árvore limpa (o tarball é o commit)',
  severity: 'critical',
  probe(env) {
    let dirty;
    try {
      dirty = git(['status', '--short'], env.root).trim();
    } catch {
      return { status: 'skipped', detail: 'fora de um repositório git', fix: null };
    }

    if (!dirty) return { status: 'ok', detail: 'nada não commitado', fix: null };

    const n = dirty.split('\n').length;
    const detalhe = `${n} arquivo(s) não commitado(s) — o tarball não corresponde a nenhum commit`;

    return env.publish
      ? { status: 'fail', detail: `${detalhe}. npm publish empacota o disco, não o commit`, fix: 'git commit' }
      : { status: 'warn', detail: `${detalhe}. Ok para smoke; não para publicar`, fix: null };
  },
};

/** Se o pacote não instala, todo o resto é irrelevante — daí todos dependerem deste. */
/** @type {Check} */
const install = {
  id: 'install',
  title: 'o pacote instala do zero',
  severity: 'critical',
  probe(env) {
    return env.pkgDir && env.fs.existsSync(env.pkgDir)
      ? { status: 'ok', detail: `instalado em ${path.basename(env.installDir)}`, fix: null }
      : { status: 'fail', detail: 'o tarball não instalou', fix: 'npm pack && npm i <tgz> — investigue o erro' };
  },
};

/**
 * Todo comando anunciado pelo registry precisa existir no tarball. É o bug da v1.1.3, generalizado:
 * `npm run dashboard` era publicado, a pasta `dashboard/` não.
 */
/** @type {Check} */
const registryScripts = {
  id: 'registry-scripts',
  title: 'todo comando do registry existe no tarball',
  severity: 'critical',
  dependsOn: 'install',
  probe(env) {
    const faltando: string[] = [];
    let total = 0;

    for (const [name, def] of Object.entries<any>(env.registry)) {
      const rel = def.node || def.script;
      if (!rel) continue;
      total += 1;
      // Resolve extensão no tarball (SPEC-012 D2): o script pode ter sido renomeado para .ts em dev
      // e compilado para .js em dist/. O resolver acha o que existe, não crava a extensão.
      const resolved = resolveScript(pkgCodeRoot(env), rel);
      if (!env.fs.existsSync(resolved)) faltando.push(`${name} → ${rel}`);
    }

    if (faltando.length) {
      return {
        status: 'fail',
        detail: `${faltando.length} comando(s) sem script no tarball: ${faltando.join(', ')}`,
        fix: 'adicione o path ao files[] do package.json',
      };
    }

    return { status: 'ok', detail: `${total}/${total} comandos com script presente`, fix: null };
  },
};

/**
 * O **código executável** do pacote — `bin/`, `lib/`, `scripts/`. Nada mais.
 *
 * `boilerplates/` também é publicado e também é `.js`, mas é **conteúdo**: templates copiados para
 * o projeto gerado. O `next.config.js` de um boilerplate importa `next` — que é dependência do
 * projeto do usuário, não do Forja. Varrer essas pastas faz o gate exigir `npm i -S next` no
 * framework, o que é absurdo (observado na primeira execução real do gate).
 *
 * Mesmo princípio de `stripTemplateLiterals`, um nível acima: o que o Forja *escreve* não é o que
 * o Forja *executa*.
 */
const CODE_DIRS = ['bin', 'lib', 'scripts'];

/**
 * A raiz onde `bin/lib/scripts` vivem **no tarball**, derivada do campo `bin` do package.json.
 *
 * Fonte-na-raiz (`bin: 'bin/forja.mjs'`) → a raiz é o próprio pacote. Publicando `dist/`
 * (`bin: 'dist/bin/forja.mjs'`, SPEC-012) → a raiz é `dist/`. É a mesma conta que o dispatch faz em
 * runtime (`root = dirname(bin)/..`); os checks de release precisam olhar no mesmo lugar, senão
 * procuram o código onde ele não está mais.
 */
function pkgCodeRoot(env) {
  try {
    const pkg = JSON.parse(env.fs.readFileSync(path.join(env.pkgDir, 'package.json'), 'utf8'));
    const binRel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.forja;
    if (binRel) return path.join(env.pkgDir, path.dirname(path.dirname(binRel)));
  } catch {
    /* sem package.json legível — cai no default */
  }
  return env.pkgDir;
}

function publishedSources(env) {
  const out: string[] = [];
  const root = pkgCodeRoot(env);

  for (const dir of CODE_DIRS) {
    const full = path.join(root, dir);
    if (env.fs.existsSync(full)) walkDir(env, full, out);
  }

  return out;
}

function walkDir(env, dir, out) {
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
      if (entry !== 'node_modules') walkDir(env, p, out);
    } else if (/\.(mjs|js)$/.test(entry)) {
      out.push(p);
    }
  }
}

const IMPORT_RE = /(?:^|\s)(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|(?:^|\s)import\s*['"]([^'"]+)['"]/gm;

function importsOf(env, file) {
  const src = stripTemplateLiterals(env.fs.readFileSync(file, 'utf8'));
  const out: string[] = [];
  for (const m of src.matchAll(IMPORT_RE)) out.push(m[1] || m[2]);
  return out;
}

/** Pacote npm (não builtin, não relativo). `@scope/x/sub` → `@scope/x`. */
function packageName(specifier) {
  if (!specifier || specifier.startsWith('.') || specifier.startsWith('/')) return null;
  if (specifier.startsWith('node:')) return null;
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** Import relativo que não resolve dentro do tarball = arquivo fora do `files[]` (bug da v1.1.3). */
/** @type {Check} */
const importsResolve = {
  id: 'imports-resolve',
  title: 'imports relativos resolvem dentro do tarball',
  severity: 'critical',
  dependsOn: 'install',
  probe(env) {
    const quebrados: string[] = [];

    for (const file of publishedSources(env)) {
      for (const spec of importsOf(env, file)) {
        if (!spec?.startsWith('.')) continue;
        const alvo = path.resolve(path.dirname(file), spec);
        const existe = env.fs.existsSync(alvo)
          || ['.js', '.mjs', '.json'].some((ext) => env.fs.existsSync(alvo + ext));
        if (!existe) quebrados.push(`${path.relative(env.pkgDir, file)} → ${spec}`);
      }
    }

    if (quebrados.length) {
      return {
        status: 'fail',
        detail: `${quebrados.length} import(s) sem destino no tarball: ${quebrados.slice(0, 3).join('; ')}`,
        fix: 'adicione o arquivo ao files[] do package.json',
      };
    }

    return { status: 'ok', detail: 'todo import relativo resolve', fix: null };
  },
};

/** O bug do ADR-0021 §2: importado por script publicado, mas declarado como devDependency. */
/** @type {Check} */
const depsDeclared = {
  id: 'deps-declared',
  title: 'todo import externo está em dependencies',
  severity: 'critical',
  dependsOn: 'install',
  probe(env) {
    const pkg = JSON.parse(env.fs.readFileSync(path.join(env.pkgDir, 'package.json'), 'utf8'));
    const deps = new Set(Object.keys(pkg.dependencies || {}));
    const faltando = new Map<string, string>();

    for (const file of publishedSources(env)) {
      for (const spec of importsOf(env, file)) {
        const nome = packageName(spec);
        if (!nome || deps.has(nome)) continue;
        faltando.set(nome, path.relative(env.pkgDir, file));
      }
    }

    if (faltando.size) {
      const lista = [...faltando].map(([n, f]) => `${n} (${f})`).join(', ');
      return {
        status: 'fail',
        detail: `importado pelo pacote mas não declarado em dependencies: ${lista}`,
        fix: `npm i -S ${[...faltando.keys()].join(' ')}`,
      };
    }

    return { status: 'ok', detail: `${deps.size} dependência(s), todas importadas por alguém`, fix: null };
  },
};

/** Peso morto viaja no tarball de todo usuário. Incomoda; não quebra — por isso `warn` (D7). */
/** @type {Check} */
const depsUnused = {
  id: 'deps-unused',
  title: 'nenhuma dependency é peso morto',
  severity: 'warn',
  dependsOn: 'install',
  probe(env) {
    const pkg = JSON.parse(env.fs.readFileSync(path.join(env.pkgDir, 'package.json'), 'utf8'));
    const deps = Object.keys(pkg.dependencies || {});
    const usados = new Set();

    for (const file of publishedSources(env)) {
      for (const spec of importsOf(env, file)) {
        const nome = packageName(spec);
        if (nome) usados.add(nome);
      }
    }

    const ociosos = deps.filter((d) => !usados.has(d));
    if (ociosos.length) {
      return {
        status: 'warn',
        detail: `declarada(s) e nunca importada(s): ${ociosos.join(', ')} — todo usuário baixa isso`,
        fix: `npm rm ${ociosos.join(' ')}`,
      };
    }

    return { status: 'ok', detail: 'nenhuma dependência ociosa', fix: null };
  },
};

/**
 * O check mais importante, e o mais fácil de errar.
 *
 * **Executar, não listar.** O `forja` sem argumentos passa mesmo com tudo quebrado — o help não
 * carrega os scripts. Foi assim que a quebra do ADR-0021 §2 se escondeu: o help funcionava, e dez
 * comandos estavam mortos.
 *
 * **Reprovar por stderr, nunca por exit code.** Numa instalação limpa não há workspace nem
 * `universal.db`; `query:universal` sai com código ≠ 0 *legitimamente*, e isso é o pacote
 * funcionando. O que denuncia tarball quebrado é a assinatura do carregamento. Reprovar por exit
 * code reprovaria um pacote saudável — a mesma armadilha do `memory-db` na SPEC-009, um nível
 * acima.
 */
/** @type {Check} */
const smokeCommands = {
  id: 'smoke-commands',
  title: 'os comandos executam de verdade',
  severity: 'critical',
  dependsOn: 'install',
  probe(env) {
    // Lê o entry point do campo `bin` do package.json, não de um path fixo — o publicado aponta
    // para dist/ (SPEC-012). Cravar `bin/forja.mjs` quebraria o smoke assim que o bin mudasse.
    const pkg = JSON.parse(env.fs.readFileSync(path.join(env.pkgDir, 'package.json'), 'utf8'));
    const binRel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.forja;
    const bin = path.join(env.pkgDir, binRel);
    const quebrados: string[] = [];

    for (const args of env.smokeCommands) {
      const res = env.spawn(process.execPath, [bin, ...args], { cwd: env.installDir });
      const saida = `${res.stdout || ''}${res.stderr || ''}`;
      if (LOADER_ERRORS.test(saida)) {
        const causa = saida.match(LOADER_ERRORS)?.[0] ?? 'erro de carregamento';
        quebrados.push(`${args[0] || '(help)'}: ${causa}`);
      }
    }

    if (quebrados.length) {
      return {
        status: 'fail',
        detail: `comando(s) não carregam na instalação limpa: ${quebrados.join('; ')}`,
        fix: 'verifique files[] e dependencies — o repo resolve, o tarball não',
      };
    }

    return {
      status: 'ok',
      detail: `${env.smokeCommands.length} comando(s) executam sem erro de carregamento`,
      fix: null,
    };
  },
};

/** @type {import('./checks.ts').Check[]} */
export const RELEASE_CHECKS = [
  treeClean,
  install,
  registryScripts,
  smokeCommands,
  importsResolve,
  depsDeclared,
  depsUnused,
];

/** Comandos sem efeito colateral. `tools:doctor` e `code:status` só leem; o help não prova nada sozinho. */
const DEFAULT_SMOKE = [[], ['tools:doctor'], ['code:status'], ['query:universal', 'teste']];

export function defaultEnv(overrides = {}) {
  return {
    root: repoRoot,
    fs,
    registry: COMMANDS,
    smokeCommands: DEFAULT_SMOKE,
    publish: false,
    spawn: (cmd, args, opts) => {
      try {
        return {
          stdout: execFileSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', ...opts }),
          stderr: '',
        };
      } catch (err) {
        const e = /** @type {any} */ (err);
        return { stdout: e.stdout || '', stderr: e.stderr || String(err) };
      }
    },
    ...overrides,
  };
}

/**
 * Roda o gate completo: empacota, instala isolado, checa, limpa.
 *
 * A aprovação é **perecível** — vale para o disco naquele instante. Por isso a árvore é reconferida
 * ao final: um `npm install` entre o check e o publish invalida tudo, e foi exatamente essa a causa
 * da v1.1.1.
 */
export async function runReleaseChecks({ publish = false, env: overrides = {} } = {}) {
  const base = defaultEnv({ publish, ...overrides });

  const arvoreAntes = git(['status', '--short'], base.root);

  const results = await withCleanInstall(
    ({ pkgDir, installDir }) => run({
      checks: RELEASE_CHECKS,
      env: { ...base, pkgDir, installDir },
    }),
    { root: base.root }
  );

  const arvoreDepois = git(['status', '--short'], base.root);
  if (arvoreAntes !== arvoreDepois) {
    results.push({
      id: 'tree-stable',
      title: 'a árvore não mudou durante a auditoria',
      severity: 'critical',
      status: 'fail',
      detail: 'o disco mudou enquanto o gate rodava — este parecer está vencido',
      fix: 'rode o gate de novo com a árvore parada',
    });
  }

  return results;
}
