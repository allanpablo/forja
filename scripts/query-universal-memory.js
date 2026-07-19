import Database from 'better-sqlite3';
import { getDbPath, ensureSchema } from './memory-schema.ts';

ensureSchema({ silent: true });
const dbPath = getDbPath();

const args = process.argv.slice(2);
const query = args[0] || '';
const limit = Number(args[1] || 5);

if (!query) {
  console.log('Uso: node scripts/query-universal-memory.js "termo de busca" [limite]');
  process.exit(0);
}

const db = new Database(dbPath, { readonly: true });

const search = db.prepare(`
  SELECT 
    n.path, 
    n.kind, 
    n.title, 
    p.name as project,
    snippet(search_idx, 2, '>', '<', '...', 20) as snippet
  FROM search_idx
  JOIN memory_nodes n ON n.id = search_idx.node_id
  LEFT JOIN projects p ON p.id = n.project_id
  WHERE search_idx MATCH ?
  ORDER BY rank
  LIMIT ?
`);

try {
  const results = search.all(query, limit);

  if (results.length === 0) {
    console.log(`Nenhum resultado encontrado para: "${query}"`);
  } else {
    console.log(`\nResultados para: "${query}"\n`);
    results.forEach(r => {
      const scope = r.project ? `[Projeto: ${r.project}]` : '[Global]';
      console.log(`${scope} ${r.title} (${r.path})`);
      console.log(`   > ${r.snippet.replace(/\n/g, ' ')}\n`);
    });
  }
} catch (e) {
  console.error('Erro na busca:', e.message);
}

db.close();
