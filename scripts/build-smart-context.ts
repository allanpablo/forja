import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { getDbPath, ensureSchema } from './memory-schema.ts';
import { resolveProject, initWorkspace } from '../lib/workspace.ts';

initWorkspace();
ensureSchema({ silent: true });
const dbPath = getDbPath();

const [project, taskKeyword = ''] = process.argv.slice(2);

if (!project) {
  console.log('Uso: node scripts/build-smart-context.js <projeto> [keyword]');
  process.exit(0);
}

const db = new Database(dbPath, { readonly: true });

function getSmartContext() {
  console.log(`🔍 Construindo contexto inteligente para: ${project} (Busca: ${taskKeyword || 'global'})...`);

  // 1. Pegar arquivos globais obrigatórios
  const globalNodes = db.prepare(`
    SELECT title, content, path FROM memory_nodes 
    WHERE project_id IS NULL AND (path LIKE '%mission.md' OR path LIKE '%standards.md')
  `).all();

  // 2. Pegar arquivos do projeto por keyword ou gerais
  let projectNodes = [];
  if (taskKeyword) {
    projectNodes = db.prepare(`
      SELECT n.title, n.content, n.path 
      FROM memory_nodes n
      JOIN projects p ON p.id = n.project_id
      JOIN search_idx s ON s.node_id = n.id
      WHERE p.name = ? AND search_idx MATCH ?
      LIMIT 10
    `).all(project, taskKeyword);
  }

  // 3. Pegar ADRs e Summaries recentes do projeto
  const metadata = db.prepare(`
    SELECT n.title, n.content, n.path 
    FROM memory_nodes n
    JOIN projects p ON p.id = n.project_id
    WHERE p.name = ? AND (n.kind = 'adr' OR n.kind = 'summary' OR n.path LIKE '%vision.md')
    ORDER BY n.updated_at DESC LIMIT 5
  `).all(project);

  const designIndex = db.prepare(`
    SELECT n.title, n.content, n.path
    FROM memory_nodes n
    JOIN projects p ON p.id = n.project_id
    WHERE p.name = ? AND n.kind = 'design' AND n.path LIKE '%/design-md/INDEX.md'
    ORDER BY n.updated_at DESC LIMIT 1
  `).all(project);

  const allNodes = [...globalNodes, ...projectNodes, ...metadata, ...designIndex];
  
  let contextPack = `# SMART CONTEXT PACK: ${project.toUpperCase()}\n\n`;
  contextPack += `> Gerado em: ${new Date().toISOString()}\n`;
  contextPack += `> Keyword de Tarefa: ${taskKeyword || 'N/A'}\n\n`;

  const seen = new Set();
  for (const node of allNodes) {
    if (seen.has(node.path)) continue;
    seen.add(node.path);
    contextPack += `## FILE: ${node.path}\n\n${node.content}\n\n---\n\n`;
  }

  const outDir = path.join(resolveProject(project), '.context');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  
  const outFile = path.join(outDir, 'smart-context.md');
  fs.writeFileSync(outFile, contextPack, 'utf8');
  
  console.log(`✅ Contexto inteligente gerado: ${outFile} (${seen.size} arquivos incluídos).`);
}

try {
  getSmartContext();
} catch (e) {
  console.error('Erro ao gerar contexto inteligente:', e.message);
} finally {
  db.close();
}
