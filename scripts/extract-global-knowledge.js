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

function extractGlobalLessons() {
  console.log('🧠 Extraindo lições aprendidas de todos os projetos para Memória Global...');
  
  const db = new Database(dbPath, { readonly: true });
  
  // Busca ADRs (Decisões) de todos os projetos
  const adrs = db.prepare(`
    SELECT n.title, n.content, p.name as project
    FROM memory_nodes n
    JOIN projects p ON p.id = n.project_id
    WHERE n.kind = 'adr'
  `).all();

  let knowledgeBase = `# Base de Conhecimento Compartilhada (Patterns)\n\n`;
  knowledgeBase += `> Gerado automaticamente via Cross-Project Analysis em: ${new Date().toISOString()}\n\n`;

  for (const adr of adrs) {
    knowledgeBase += `### [Proveniente de: ${adr.project}] ${adr.title}\n\n`;
    // Pega apenas o resumo ou contexto da decisão
    const contextMatch = adr.content.match(/## Contexto\n([\s\S]*?)(?=##|$)/);
    const decisionMatch = adr.content.match(/## Decisao\n([\s\S]*?)(?=##|$)/);

    if (contextMatch && decisionMatch) {
      knowledgeBase += `**Contexto:** ${contextMatch[1].trim().slice(0, 300)}...\n\n`;
      knowledgeBase += `**Padrao Adotado:** ${decisionMatch[1].trim()}\n\n`;
    }
  }

  const outFile = path.join(root, 'memory/00-global/shared-knowledge.md');
  fs.writeFileSync(outFile, knowledgeBase, 'utf8');
  
  console.log(`✅ Base de conhecimento global atualizada em: ${outFile}`);
  db.close();
}

try {
  extractGlobalLessons();
} catch (e) {
  console.error('Erro ao extrair lições:', e.message);
}
