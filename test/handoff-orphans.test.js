import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { orphanHandoffs } from '../lib/handoffs-index.ts';

// Handoff sem projeto (pré-v5) ou de projeto apagado é órfão: ninguém o verá no briefing.
test('orphanHandoffs: acusa sem-projeto e projeto-inexistente; ignora fechados e projetos vivos', async () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-orphans-'));
  const prev = process.env.FORJA_WORKSPACE;
  process.env.FORJA_WORKSPACE = ws;
  try {
    fs.mkdirSync(path.join(ws, 'memory', 'sqlite'), { recursive: true });
    const db = new Database(path.join(ws, 'memory', 'sqlite', 'universal.db'));
    db.exec('CREATE TABLE handoffs (id INTEGER PRIMARY KEY, status TEXT, payload_json TEXT)');
    const add = db.prepare('INSERT INTO handoffs (status, payload_json) VALUES (?, ?)');
    add.run('open', JSON.stringify({}));                          // 1 sem projeto
    add.run('open', JSON.stringify({ project: 'apagado' }));      // 2 projeto inexistente
    add.run('open', JSON.stringify({ project: 'vivo' }));         // 3 ok
    add.run('open', JSON.stringify({ project: 'forja' }));        // 4 ok (framework)
    add.run('archived', JSON.stringify({}));                      // 5 fechado
    db.close();

    const orphans = await orphanHandoffs(['vivo']);
    assert.deepEqual(orphans, [
      { id: 1, project: null, reason: 'sem-projeto' },
      { id: 2, project: 'apagado', reason: 'projeto-inexistente' },
    ]);
  } finally {
    if (prev === undefined) delete process.env.FORJA_WORKSPACE; else process.env.FORJA_WORKSPACE = prev;
    fs.rmSync(ws, { recursive: true, force: true });
  }
});
