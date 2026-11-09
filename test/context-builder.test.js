import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ContextBuilder, {
  excerptAround,
  headExcerpt,
  nodeBody,
  FULL_CONTENT_MAX_CHARS,
} from '../lib/context-builder.ts';
import { script } from '../lib/paths.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const longo = (termo, sentinela) =>
  `# Nota de ${termo}\n\n` +
  '## Seção 0\n\n' +
  `Regra de ${termo}: o agregado valida o invariante antes de persistir, e o evento publicado carrega ` +
  'identificador idempotente da tentativa anterior para o consumidor não duplicar o efeito.\n\n' +
  '## Enchimento\n\n' +
  'Parágrafo de contexto que só existe para o nó passar do limite de conteúdo integral e obrigar o ' +
  'trecho a ser calculado em vez de injectado por inteiro. '.repeat(24) +
  `\n\n${sentinela}\n`;

// --- SPEC-057 AC-1: política de trecho (unidades puras, sem banco) -----------

test('nodeBody: nó abaixo do limite entra inteiro, sem marcador de omissão', () => {
  const content = 'texto curto';
  assert.deepEqual(nodeBody({ path: 'memory/a.md', content }), { text: content, omitted: 0 });
});

test('nodeBody: nó longo entra pela cabeça e diz quantos chars ficaram de fora', () => {
  const content = 'linha\n'.repeat(2000);
  const body = nodeBody({ path: 'docs/guia.md', content });
  assert.ok(body.text.length < content.length, 'cabeça não cortou nada');
  assert.match(body.text, /chars omitidos/);
  assert.match(body.text, /--full-context/);
  assert.ok(body.omitted > 0);
});

test('nodeBody: missão e padrões nunca são cortados, por tamanho que tenham', () => {
  for (const rel of ['memory/00-global/mission.md', 'memory/00-global/standards.md']) {
    const content = 'x'.repeat(FULL_CONTENT_MAX_CHARS * 3);
    const body = nodeBody({ path: rel, content });
    assert.equal(body.text, content, `${rel} foi cortado`);
    assert.equal(body.omitted, 0);
  }
});

test('nodeBody: full injeta o nó integral mesmo quando longo', () => {
  const content = 'y'.repeat(FULL_CONTENT_MAX_CHARS * 3);
  const body = nodeBody({ path: 'docs/guia.md', content }, { full: true });
  assert.equal(body.text, content);
  assert.equal(body.omitted, 0);
});

test('nodeBody: o trecho casado (FTS) tem precedência sobre a cabeça do nó', () => {
  const content = 'z'.repeat(FULL_CONTENT_MAX_CHARS * 3);
  const body = nodeBody({ path: 'docs/guia.md', content, excerpt: '… trecho casado …' });
  assert.match(body.text, /^… trecho casado …/);
});

test('headExcerpt corta em fronteira de linha, não no meio de uma', () => {
  const content = `${'a'.repeat(50)}\n${'b'.repeat(5000)}\nFIM`;
  const out = headExcerpt(content, 120);
  assert.equal(out, 'a'.repeat(50));
});

test('excerptAround centraliza a ocorrência e corta em fronteira de palavra', () => {
  const content = `${'palavra '.repeat(60)}ALVO${' palavra'.repeat(60)}`;
  const out = excerptAround(content, 'ALVO', 24);
  assert.match(out, /ALVO/);
  assert.match(out, /^… /, 'janela no meio do texto abre com reticência');
  assert.match(out, / …$/, 'e fecha com reticência');
  assert.match(out, /^… palavra /, 'corte no meio de palavra parece defeito de encoding');
  assert.ok(out.length < content.length);
});

test('excerptAround sem ocorrência cai na cabeça do nó', () => {
  const content = `# Título\n\n${'x'.repeat(4000)}`;
  assert.equal(excerptAround(content, 'inexistente'), headExcerpt(content));
});

// --- SPEC-057 AC-1 no pack real (FTS5 + LIKE sobre um workspace temporário) ---

/**
 * Um workspace com projeto indexado, construído uma vez para o arquivo inteiro: cada `sync:universal`
 * custa ~1s (ele indexa também a memória do pacote) e o que os testes abaixo verificam é o mesmo
 * banco.
 */
let wsCache = null;
function workspace() {
  if (wsCache) return wsCache;
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-ctx-'));
  const proj = path.join(ws, 'projects', 'demo');
  const write = (rel, body) => {
    const abs = path.join(proj, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  };
  write('memory/30-domains/pedidos/nota-pagamentos.md', longo('pagamentos', 'SENTINELA_FIM_PAGAMENTOS'));
  write('memory/10-vision/vision.md', longo('visao', 'SENTINELA_FIM_VISAO'));
  write('memory/00-global/mission.md', longo('missao', 'SENTINELA_FIM_MISSAO'));
  write('docs/guia-pagamentosavancado.md', longo('pagamentosavancado', 'SENTINELA_FIM_GUIA'));

  const sync = spawnSync(process.execPath, [path.join(root, 'bin/forja.ts'), 'sync:universal'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, FORJA_WORKSPACE: ws },
  });
  assert.equal(sync.status, 0, `sync falhou: ${sync.stderr}`);
  wsCache = { ws, proj, dbPath: path.join(ws, 'memory/sqlite/universal.db') };
  return wsCache;
}

function pack(keyword, opts) {
  const { proj, dbPath } = workspace();
  const builder = new ContextBuilder(proj, dbPath);
  try {
    return builder.build('task', 'demo', keyword, opts);
  } finally {
    builder.close();
  }
}

test('modo task injeta o trecho casado com marcador, não o nó inteiro', () => {
  const md = pack('pagamentos');
  assert.match(md, /\*\*pagamentos\*\*/, 'snippet do FTS5 marca o casamento');
  assert.match(md, /chars omitidos/, 'o corte é visível');
  assert.ok(!md.includes('SENTINELA_FIM_PAGAMENTOS'), 'o fim do nó longo vazou para o pack');
  assert.match(md, /- \*\*Excerpts\*\*: [1-9]\d*\/\d+ nodes/);
});

// SPEC-057 AC-5: cortar o conteúdo não pode mudar a letra do pacote. Quem consome o pack (o agente que
// o cola no contexto, e `docs/commands.md`) parseia `**Path**: \`…\`` — e o caminho tem que ser POSIX em
// qualquer SO, porque um texto colado no contexto de um agente não pode variar conforme a máquina. Foi
// exatamente isso que a célula Windows achou: `path.relative()` cru emitia `backend\src\…` lá.
test('modo task continua achando o nó pelo caminho (contrato do pack preservado)', () => {
  const md = pack('pagamentos');
  assert.match(md, /\*\*Path\*\*: `projects\/demo\/memory\/30-domains\/pedidos\/nota-pagamentos\.md`/);
});

test('full devolve o mesmo nó integral, sem marcador de omissão', () => {
  const md = pack('pagamentos', { full: true });
  assert.ok(md.includes('SENTINELA_FIM_PAGAMENTOS'), 'com full o nó vem inteiro');
  assert.ok(!md.includes('chars omitidos'));
  assert.match(md, /- \*\*Excerpts\*\*: 0\/\d+ nodes/);
});

test('o trecho corta menos token que o conteúdo integral do mesmo pack', () => {
  const trecho = pack('pagamentos').length;
  const integral = pack('pagamentos', { full: true }).length;
  assert.ok(trecho < integral * 0.8, `redução insuficiente: ${trecho} vs ${integral}`);
});

test('termo que o FTS não casa (substring) ainda entra, pela janela do LIKE', () => {
  // "pagament" é prefixo de "pagamentos": o porter não casa, o LIKE sim.
  const md = pack('pagament');
  assert.match(md, /nota-pagamentos\.md/, 'o LIKE perdeu o nó que o FTS não casa');
  assert.match(md, /…/, 'a janela calculada marca o corte');
});

test('missão entra inteira mesmo no pack cortado', () => {
  const md = pack('pagamentos');
  assert.ok(md.includes('SENTINELA_FIM_MISSAO'), 'mission.md foi cortado — é a constituição do pack');
});

// --- degradação: banco ausente ou quebrado ------------------------------------

test('connect: sem índice, o erro diz o caminho em vez de estourar SQL opaco', () => {
  const builder = new ContextBuilder(root, path.join(root, 'nao-existe.db'));
  assert.throws(() => builder.connect(), /Database not found: .*nao-existe\.db$/);
});

test('banco quebrado: o pack degrada vazio e avisa, não derruba o comando', () => {
  const builder = new ContextBuilder(root, '/dev/null');
  builder.db = { prepare: () => { throw new Error('no such table: memory_nodes'); }, close: () => {} };

  const avisos = [];
  const warn = console.warn;
  console.warn = (...args) => avisos.push(args.map(String).join(' '));
  let md;
  try {
    md = builder.build('task', 'demo', 'pagamentos');
  } finally {
    console.warn = warn;
    builder.close();
  }

  assert.match(md, /- \*\*Files\*\*: 0\n/, 'pack vazio ainda entrega o footer parseável');
  assert.match(md, /- \*\*Excerpts\*\*: 0\/0 nodes/);
  assert.ok(avisos.length >= 3, `as 4 consultas deveriam avisar, vieram ${avisos.length}`);
  assert.ok(avisos.every((a) => a.includes('no such table')), 'aviso sem a causa real');
});

test('stats e save: métricas do pack e gravação criando o diretório que falta', () => {
  const builder = new ContextBuilder(root, '/dev/null');
  builder.db = { prepare: () => { throw new Error('no such table: memory_nodes'); }, close: () => {} };
  const warn = console.warn;
  console.warn = () => {};
  try {
    const stats = builder.stats('global', 'demo');
    assert.equal(stats.mode, 'global');
    assert.equal(stats.project, 'demo');
    assert.equal(stats.keyword, '');
    assert.equal(stats.tokens, Math.round(stats.bytes / 4), 'régua bytes/4 é o contrato');
    assert.match(stats.estimatedCost, /^\d+\.\d{4}$/, 'custo vem como string de 4 casas');
    assert.ok(stats.lines > 0);

    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-ctx-save-'));
    const outFile = path.join(outDir, 'falta', 'este', 'context-global.md');
    builder.save('conteúdo', outFile);
    assert.equal(fs.readFileSync(outFile, 'utf8'), 'conteúdo');
    fs.rmSync(outDir, { recursive: true, force: true });
  } finally {
    console.warn = warn;
    builder.close();
  }
});

// --- o comando, não só a biblioteca ------------------------------------------

function cli(args, cwd) {
  const { ws } = workspace();
  return spawnSync(process.execPath, [script('bin/forja'), ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, FORJA_WORKSPACE: ws },
  });
}

test('context:smart pelo CLI: trecho por padrão, inteiro só quando se pede', () => {
  const { proj } = workspace();
  const base = ['context:smart', '--mode', 'task', '--project', 'demo', '--task', 'pagamentos'];

  const cortado = cli(base, proj);
  assert.equal(cortado.status, 0, cortado.stderr);
  assert.match(cortado.stdout, /\d+ nó\(s\) em trecho \(--full-context injeta inteiro\)/);
  const pack = fs.readFileSync(path.join(proj, '.context', 'smart-context.md'), 'utf8');
  assert.match(pack, /chars omitidos/);
  assert.ok(!pack.includes('SENTINELA_FIM_PAGAMENTOS'), 'o pack padrão vazou o nó inteiro');

  const inteiro = cli([...base, '--full-context'], proj);
  assert.equal(inteiro.status, 0, inteiro.stderr);
  assert.ok(!inteiro.stdout.includes('em trecho'), '--full-context ainda anunciou trecho');
  const cheio = fs.readFileSync(path.join(proj, '.context', 'smart-context.md'), 'utf8');
  assert.ok(cheio.includes('SENTINELA_FIM_PAGAMENTOS'), 'com --full-context o nó tinha que vir inteiro');
});

test('a ajuda do contexto sai do registro, não de um texto à parte (drift de flag)', () => {
  const { proj } = workspace();
  const r = cli(['context:smart', '--mode', 'banana'], proj);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Uso: forja context:smart .*--full-context/, 'o help promete as flags que o registro declara');
});
