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
  const res = spawnSync(process.execPath, [path.join(root, 'bin/forja.ts'), 'sync:universal'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, FORJA_WORKSPACE: ws },
  });
  assert.equal(res.status, 0, `sync:universal falhou: ${res.stderr}`);
  return res.stdout;
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

/**
 * SPEC-057 AC-3: o `content_hash` sempre foi gravado e nunca foi comparado — todo sync re-upsertava e
 * re-indexava tudo. Pular o inalterado tem duas armadilhas que este teste prende: o nó pulado precisa
 * continuar íntegro e buscável (pular não é perder), e o banco precisa parecer novo para o check
 * `memory-fresh`, que compara o mtime do banco com o de memory/ — um sync que não escreve nada
 * deixaria o índice em dia com aviso de índice velho aceso.
 */
test('sync:universal pula o que não mudou, reprocessa o que mudou e ainda marca o banco como novo', () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-incr-'));
  try {
    ficha(ws, 'estavel.md', 'Ficha Estável');
    ficha(ws, 'mutavel.md', 'Ficha Mutável');
    const primeiro = sync(ws);
    assert.match(primeiro, /indexados/, 'primeiro sync não indexou nada');

    const dbPath = path.join(ws, 'memory/sqlite/universal.db');
    const antes = new Database(dbPath, { readonly: true })
      .prepare("SELECT content_hash, updated_at FROM memory_nodes WHERE path LIKE '%estavel.md'")
      .get();

    // mtime novo com conteúdo igual: o pulo tem que ser por hash, não por data de modificação.
    fs.utimesSync(path.join(ws, 'memory/30-projects/mutavel.md'), new Date(), new Date());
    const segundo = sync(ws);
    assert.match(segundo, /[1-9]\d* inalterados \(pulados\)/, `re-sync reprocessou tudo: ${segundo.trim()}`);

    // Um char mudado: só aquele nó volta a ser processado (falso skip é o risco alto do AC-3).
    const alvo = path.join(ws, 'memory/30-projects/mutavel.md');
    fs.writeFileSync(alvo, `${fs.readFileSync(alvo, 'utf8')}\nDetalhe novo que muda o hash.\n`);
    const terceiro = sync(ws);
    assert.match(terceiro, /[1-9]\d* indexados/, 'a mutação não foi reprocessada');

    const db = new Database(dbPath, { readonly: true });
    try {
      const depois = db
        .prepare("SELECT content_hash, updated_at FROM memory_nodes WHERE path LIKE '%estavel.md'")
        .get();
      assert.equal(depois.content_hash, antes.content_hash, 'o hash do nó inalterado mudou');
      assert.equal(depois.updated_at, antes.updated_at, 'o nó inalterado foi regravado');

      const buscavel = db
        .prepare("SELECT COUNT(*) AS c FROM search_idx WHERE search_idx MATCH '\"Estável\"'")
        .get().c;
      assert.ok(buscavel > 0, 'pular o re-sync quebrou a busca do nó inalterado');

      const meta = db.prepare("SELECT value FROM sync_meta WHERE name = 'last_sync'").get();
      assert.ok(meta, 'a execução não ficou registrada em sync_meta');
      assert.ok(
        fs.statSync(dbPath).mtimeMs >= fs.statSync(alvo).mtimeMs,
        'banco parece mais velho que memory/ — memory-fresh vai avisar com o índice em dia'
      );
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});
