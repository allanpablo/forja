import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// SPEC-056 AC-1 e AC-5: a matriz multi-OS e o custo dela vivem num arquivo que nenhuma suíte executa —
// `.github/workflows/ci.yml`. Sem este teste, o que garante os dois critérios é a leitura de quem fez o
// PR, e o histórico do repo mostra o que isso vale: o comando `--full` anunciado no help não chegava ao
// script (SPEC-057), e três rotas que o painel consumia não tinham decorador no controller. Deriva de
// declaração que ninguém executa é a mesma classe de defeito.
//
// O teste lê o YAML como texto de propósito: adicionar um parser só para validar o CI seria importar a
// segunda máquina que a SPEC-056 manda não importar.
// ---------------------------------------------------------------------------

const RAIZ = path.resolve(import.meta.dirname, '..');
// `.gitattributes` tem `* text=auto` e o runner Windows faz checkout com CRLF. Todo padrão aqui tem
// `\n` e o recorte de job compara linhas inteiras, então sem normalizar o teste viraria um falso
// negativo justamente na célula que existe para caçar diferença de plataforma — a mesma armadilha da
// causa 5 do inventário da SPEC-056, que `lib/core/health.ts` resolve do mesmo jeito.
const CI = fs.readFileSync(path.join(RAIZ, '.github/workflows/ci.yml'), 'utf8').replace(/\r\n/g, '\n');

/** Recorta um job do `jobs:` — termina na primeira linha com recuo menor que 3 (outro job, ou comentário). */
function job(nome) {
  const linhas = CI.split('\n');
  const inicio = linhas.indexOf(`  ${nome}:`);
  assert.notEqual(inicio, -1, `o workflow não declara o job "${nome}"`);
  const fim = linhas.findIndex((l, i) => i > inicio && l.trim() !== '' && !l.startsWith('   '));
  return linhas.slice(inicio, fim === -1 ? linhas.length : fim).join('\n');
}

const TEST = job('test');

// --- AC-1: matriz multi-OS com fail-fast: false ------------------------------

test('AC-1: o job test roda em matriz de OS × Node, não num OS só', () => {
  assert.match(TEST, /runs-on: \$\{\{ matrix\.os \}\}/, 'o runner vem da matriz');
  assert.match(TEST, /os: \[ubuntu-latest, macos-latest, windows-latest\]/);
  assert.match(TEST, /node-version: \[22\.x, 24\.x\]/);
});

test('AC-1: as células efetivas são ubuntu×22/24 e macos/windows×24', () => {
  const exclusoes = [...TEST.matchAll(/- os: (\S+)\n\s+node-version: (\S+)/g)].map((m) => `${m[1]}@${m[2]}`);
  const celulas = ['ubuntu-latest', 'macos-latest', 'windows-latest'].flatMap((os) =>
    ['22.x', '24.x'].filter((v) => !exclusoes.includes(`${os}@${v}`)).map((v) => `${os}@${v}`),
  );
  assert.deepEqual(celulas, [
    'ubuntu-latest@22.x',
    'ubuntu-latest@24.x',
    'macos-latest@24.x',
    'windows-latest@24.x',
  ]);
});

test('AC-1: fail-fast desligado — uma célula vermelha não esconde as outras', () => {
  // Com fail-fast o Actions cancela as pernas irmãs, e o relatório do PR passa a listar só a primeira
  // falha: foi assim que as 23 falhas do Windows chegaram uma de cada vez nas rodadas 1-4 (AC-4).
  assert.match(TEST, /strategy:\n\s+fail-fast: false/);
});

test('AC-1: falha bloqueia em toda célula, e a única tolerada é a Windows com a regra de saída ao lado', () => {
  const tolerancias = [...TEST.matchAll(/continue-on-error: (.+)/g)];
  assert.equal(tolerancias.length, 1, 'nenuma outra célula pode falhar em silêncio');
  assert.equal(tolerancias[0][1].trim(), "${{ matrix.os == 'windows-latest' }}");

  // A célula existe para caçar defeito de plataforma e achou 23 (SPEC-056 AC-4). Ela só deixa de
  // segurar o merge enquanto o inventário do spec estiver aberto — e a linha que diz isso tem que
  // continuar no arquivo, senão a tolerância vira mobília e ninguém lembra de tirar.
  assert.match(TEST, /Tirar esta linha é o gate de que o inventário zerou/);
  assert.match(TEST, /specs\/v6-quality-gates\/spec\.md/, 'o comentário aponta para onde o inventário vive');
});

// --- AC-5: as réguas não somam tempo ao CI ----------------------------------

test('AC-5: no ubuntu a cobertura SUBSTITUI o passo de teste, em condições mutuamente exclusivas', () => {
  assert.match(TEST, /if: matrix\.os == 'ubuntu-latest'\n\s+run: node bin\/forja\.ts quality:coverage/);
  assert.match(TEST, /if: matrix\.os != 'ubuntu-latest'\n\s+run: npm test/);

  // A garantia real não é cada passo existir, é nenhuma célula rodar a suíte duas vezes.
  assert.equal(TEST.match(/^ {8}run: .*quality:coverage$/gm)?.length, 1);
  assert.equal(TEST.match(/^ {8}run: npm test$/gm)?.length, 1);
});

test('AC-5: as células rodam em paralelo — o job não espera ninguém nem limita as pernas', () => {
  assert.ok(!/^\s+needs:/m.test(TEST), 'needs: colocaria o job atrás de outro');
  assert.ok(!TEST.includes('max-parallel'), 'max-parallel serializaria a matriz');
  assert.match(TEST, /cache: npm/, 'sem cache por SO a matriz pagaria download em toda célula');
});

// --- AC-3 (ponta do CI): o passo que o workflow invoca existe ----------------

test('AC-3: o comando que a célula ubuntu invoca está registrado e tem atalho npm', () => {
  const registry = fs.readFileSync(path.join(RAIZ, 'lib/core/registry.ts'), 'utf8');
  assert.match(registry, /quality:coverage/, 'o CI chama um comando que o registry não declara = passo morto');

  const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8'));
  assert.match(pkg.scripts['test:coverage'], /quality:coverage/, 'o atalho local tem que medir a mesma coisa que o CI');
});
