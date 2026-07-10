import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function sync(ws) {
  const res = spawnSync(process.execPath, [path.join(root, 'bin/forja.mjs'), 'sync:universal'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, FORJA_WORKSPACE: ws },
  });
  assert.equal(res.status, 0, `sync:universal falhou: ${res.stderr}`);
}

function ficha(ws, nome, titulo) {
  const dir = path.join(ws, 'memory/30-projects');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, nome), `# ${titulo}\n\nConteúdo exclusivo de ${titulo}.\n`);
}

function auditar(ws) {
  const db = new Database(path.join(ws, 'memory/sqlite/universal.db'), { readonly: true });
  try {
    const pares = db
      .prepare('SELECT m.title AS mt, s.title AS st FROM memory_nodes m JOIN search_idx s ON s.node_id = m.id')
      .all();
    const orfaos = db
      .prepare('SELECT COUNT(*) AS c FROM search_idx WHERE node_id NOT IN (SELECT id FROM memory_nodes)')
      .get().c;
    return {
      pares: pares.length,
      cruzados: pares.filter((r) => (r.mt || '').trim() !== (r.st || '').trim()),
      orfaos,
    };
  } finally {
    db.close();
  }
}

/**
 * Regressão do ADR-0021.
 *
 * O sync usava `result.lastInsertRowid` para achar o id do nó recém-gravado. Num
 * `INSERT ... ON CONFLICT DO UPDATE` que *atualiza*, o SQLite não redefine esse valor:
 * ele mantém o id do último INSERT da conexão. O fallback `|| SELECT id ...` nunca
 * disparava, porque um id obsoleto ainda é truthy. O FTS então gravava o conteúdo de um
 * documento sob o node_id de outro, e a busca devolvia título e caminho errados, calada.
 *
 * A falha exige a ordem INSERT-depois-UPDATE dentro da mesma execução: num workspace
 * virgem tudo é INSERT e o bug se esconde. Por isso o teste sincroniza duas vezes,
 * introduzindo um arquivo novo que é processado antes dos já existentes.
 */
test('sync:universal mantém search_idx alinhado após um insert seguido de updates', () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-idx-'));
  try {
    // 1ª passada: tudo é INSERT. O bug não se manifesta aqui.
    ficha(ws, 'zzz-antigo.md', 'Ficha Antiga');
    sync(ws);
    const antes = auditar(ws);
    assert.ok(antes.pares > 0, 'nenhum nó indexado');
    assert.equal(antes.cruzados.length, 0, 'índice já nasce cruzado');

    // 2ª passada: o arquivo novo ordena primeiro, então é INSERT; a ficha antiga vem
    // depois e é UPDATE — herdando o rowid do insert anterior no código com bug.
    ficha(ws, '000-novo.md', 'Ficha Nova');
    sync(ws);

    const depois = auditar(ws);
    assert.equal(
      depois.cruzados.length,
      0,
      `${depois.cruzados.length} nós com conteúdo cruzado no FTS, ex.: ${JSON.stringify(depois.cruzados[0])}`
    );
    assert.equal(depois.orfaos, 0, `${depois.orfaos} linhas órfãs no search_idx`);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});
