import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

import {
  formatBytes,
  nodesIn,
  referenceProject,
  referenceScenario,
  referenceScenarioReport,
  taskKeyword,
  walkMarkdown,
} from '../scripts/token-benchmark.ts';

/**
 * O cenário de referência é a máquina que produz a evidência do AC-2 da SPEC-057 — e o benchmark já
 * anunciou 99,6% de economia medindo um projeto que não existia (domain/task voltavam só com os
 * globais). Um número que ninguém vigia decide no escuro com ar de número, então a medição é testada
 * como qualquer outra superfície.
 */
// O cenário é determinístico e custa ~1s (ele sincroniza um workspace temporário): medir uma vez e
// ler três vezes.
let cached = null;
const rows = () => (cached ??= referenceScenario());

test('cenário de referência: o trecho FTS5 corta pelo menos metade dos tokens do pack', () => {
  const fts = rows().find((r) => r.keyword === 'pagamentos');

  assert.ok(fts, 'o termo que casa não foi medido');
  assert.ok(fts.nodes >= 20, `nós de menos para o cenário de referência (${fts.nodes})`);
  assert.ok(fts.integral > fts.trecho, 'o trecho não é menor que o conteúdo integral');
  assert.ok(fts.corte >= 50, `redução de ${fts.corte}% abaixo da meta de 50% do AC-2`);
});

test('cenário de referência: o termo que só o LIKE casa também entra cortado', () => {
  // "pagament" é prefixo: o porter não casa, a janela calculada no TS assume. Sem este ramo o pack
  // perderia exatamente as buscas por símbolo/substring — as mais comuns de um agente.
  const like = rows().find((r) => r.keyword === 'pagament');

  assert.ok(like && like.nodes > 0, 'a busca por substring não achou nenhum nó');
  assert.ok(like.corte >= 50, `redução de ${like?.corte}% no caminho do LIKE`);
});

test('cenário de referência: termo sem casamento não inventa economia', () => {
  const vazio = rows().find((r) => r.keyword === 'termo-inexistente');

  assert.ok(vazio, 'o controle não foi medido');
  assert.equal(vazio.corte, 0, 'com nada casando, o pacote é o global — cortar ali seria perda pura');
});

// --- as peças que escolhem O QUE medir ----------------------------------------

/** Banco mínimo com dois projetos: o maior tem que ganhar, e projeto sem nó não é referência. */
function bancoFake() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-bench-db-'));
  const dbPath = path.join(dir, 'universal.db');
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE memory_nodes (id INTEGER PRIMARY KEY, path TEXT NOT NULL, project_id INTEGER);
    INSERT INTO projects (id, name) VALUES (1, 'vazio'), (2, 'cheio');
    INSERT INTO memory_nodes (path, project_id) VALUES
      ('memory/30-domains/pedidos/nota-1.md', 2),
      ('memory/30-domains/pedidos/nota-2.md', 2),
      ('specs/outra/spec.md', 2);
  `);
  db.close();
  return { dir, dbPath };
}

test('referenceProject escolhe o projeto com mais nós — nunca um nome chutado', () => {
  const { dir, dbPath } = bancoFake();
  try {
    assert.deepEqual(referenceProject(dbPath), { name: 'cheio', nodes: 3 });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('referenceProject devolve null quando nenhum projeto tem nó', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-bench-db-'));
  const dbPath = path.join(dir, 'universal.db');
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE memory_nodes (id INTEGER PRIMARY KEY, path TEXT NOT NULL, project_id INTEGER);
    INSERT INTO projects (id, name) VALUES (1, 'vazio');
  `);
  db.close();
  try {
    assert.equal(referenceProject(dbPath), null, 'benchmark sem projeto tem que dizer, não medir vento');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('taskKeyword pesca um termo que existe no projeto (domínio, depois spec, depois nada)', () => {
  const { dir, dbPath } = bancoFake();
  try {
    assert.equal(taskKeyword(dbPath, 'cheio'), 'pedidos');

    const db = new Database(dbPath);
    db.exec(`DELETE FROM memory_nodes WHERE path LIKE '%30-domains%'`);
    db.close();
    assert.equal(taskKeyword(dbPath, 'cheio'), 'outra', 'sem domínio, o slug da spec é o termo');

    const db2 = new Database(dbPath);
    db2.exec(`DELETE FROM memory_nodes`);
    db2.close();
    assert.equal(taskKeyword(dbPath, 'cheio'), 'regra', 'sem nada indexado, cai no termo genérico');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('nodesIn conta os nós injetados no pacote', () => {
  assert.equal(nodesIn('## 📄 A\n\nx\n\n---\n\n## 📄 B\n'), 2);
  assert.equal(nodesIn('## Context Metadata\n'), 0, 'footer não é nó');
});

test('formatBytes e walkMarkdown: base legível e varredura que ignora ruído', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(512), '512.00 B');
  assert.equal(formatBytes(2048), '2.00 KB');
  assert.equal(formatBytes(3 * 1024 * 1024), '3.00 MB');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-bench-walk-'));
  try {
    fs.mkdirSync(path.join(dir, 'memory', '30-domains'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'archive'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'memory', '30-domains', 'nota.md'), 'x');
    fs.writeFileSync(path.join(dir, 'memory', 'ignore.txt'), 'x');
    fs.writeFileSync(path.join(dir, 'archive', 'velho.md'), 'x');

    const achados = walkMarkdown(dir).map((p) => path.relative(dir, p));
    assert.deepEqual(achados, [path.join('memory', '30-domains', 'nota.md')]);
    assert.deepEqual(walkMarkdown(path.join(dir, 'nao-existe')), [], 'diretório ausente não estoura');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('referenceScenarioReport: imprime a tabela com o veredito do AC-2, e avisa quando não mediu', () => {
  const linhas = [];
  const log = console.log;
  const warn = console.warn;
  console.log = (...a) => linhas.push(a.map(String).join(' '));
  console.warn = (...a) => linhas.push(a.map(String).join(' '));
  try {
    referenceScenarioReport(rows());
    referenceScenarioReport(null);
  } finally {
    console.log = log;
    console.warn = warn;
  }

  const texto = linhas.join('\n');
  assert.match(texto, /"pagamentos"\s+\d+ nós/, 'a linha do termo que casa sumiu da tabela');
  assert.match(texto, /Meta AC-2 \(≥ 50% no termo que casa\): −\d+% → ✅/);
  assert.match(texto, /não foi possível medir/, 'sem medição, o relatório tem que dizer — não fingir');
});
