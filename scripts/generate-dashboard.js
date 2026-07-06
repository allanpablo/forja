import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { getDbPath, ensureSchema } from './memory-schema.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
ensureSchema({ silent: true });
const dbPath = getDbPath();

function generate() {
  console.log('📊 Gerando Dashboard Global do Ecossistema...');
  
  const db = new Database(dbPath, { readonly: true });
  
  const projects = db.prepare('SELECT * FROM projects').all();
  
  let md = `# 🛰️ Dashboard do Ecossistema de Agentes\n\n`;
  md += `> Gerado em: ${new Date().toISOString()}\n\n`;
  
  md += `| Projeto | ADRs | Summaries | Docs | Última Atividade |\n`;
  md += `|---------|------|-----------|------|-------------------|\n`;

  for (const p of projects) {
    const stats = db.prepare(`
      SELECT 
        SUM(CASE WHEN kind = 'adr' THEN 1 ELSE 0 END) as adrs,
        SUM(CASE WHEN kind = 'summary' THEN 1 ELSE 0 END) as summaries,
        COUNT(*) as total,
        MAX(updated_at) as last_update
      FROM memory_nodes 
      WHERE project_id = ?
    `).get(p.id);

    md += `| **${p.name}** | ${stats.adrs} | ${stats.summaries} | ${stats.total} | ${stats.last_update.split('T')[0]} |\n`;
  }

  md += `\n## 🧠 Lições Globais Recentes\n\n`;
  const recentLessons = db.prepare(`
    SELECT title, path FROM memory_nodes 
    WHERE kind = 'global' AND path LIKE '%shared-knowledge.md'
  `).get();

  if (recentLessons) {
    md += `- [Clique aqui para ver a Base de Conhecimento Compartilhada](${recentLessons.path})\n`;
  }

  fs.writeFileSync(path.join(root, 'DASHBOARD-PROGRESSO.md'), md, 'utf8');
  console.log('✅ Dashboard atualizado: DASHBOARD-PROGRESSO.md');
  db.close();
}

try {
  generate();
} catch (e) {
  console.error('Erro ao gerar dashboard:', e.message);
}
