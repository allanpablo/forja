/**
 * Context Builder - API Reutilizável para Construção de Contexto Inteligente
 * 
 * Suporta 3 modos de contexto:
 * - 'global': Apenas contexto global (mission, standards, decisões recentes)
 * - 'domain': Contexto de domínio específico + globais
 * - 'task': Contexto orientado a tarefa + domain + globais (mais compacto)
 * 
 * Usa SQLite FTS5 para busca eficiente e cache local para reutilização.
 */

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { getDbPath, ensureSchema } from '../scripts/memory-schema.ts';

export class ContextBuilder {
  projectPath: string;
  dbPath: string;
  db: any;
  cache: Map<any, any>;
  maxCacheSize: number;

  constructor(projectPath: any, dbPath: any) {
    this.projectPath = projectPath;
    this.dbPath = dbPath;
    this.db = null;
    this.cache = new Map();
    this.maxCacheSize = 50; // MB
  }

  /**
   * Abrir conexão com banco de dados (readonly)
   */
  connect() {
    if (this.db) return;
    
    if (!fs.existsSync(this.dbPath)) {
      throw new Error(`Database not found: ${this.dbPath}`);
    }
    
    this.db = new Database(this.dbPath, { readonly: true });
  }

  /**
   * Fechar conexão
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Construir contexto no modo especificado
   * 
   * @param {string} mode - 'global', 'domain', 'task'
   * @param {string} project - Nome do projeto
   * @param {string} keyword - Palavra-chave para busca (modo 'task')
   * @returns {string} Conteúdo do contexto em markdown
   */
  build(mode: any, project: any, keyword = '') {
    this.connect();
    
    const started = Date.now();
    const nodes: any[] = [];
    const seenPaths = new Set();

    // 1. Contexto global obrigatório
    const globalNodes = this._getGlobalNodes();
    nodes.push(...globalNodes);

    // 2. Contexto específico por modo
    if (mode === 'domain' || mode === 'task') {
      const domainNodes = this._getDomainNodes(project);
      nodes.push(...domainNodes);
    }

    if (mode === 'task' && keyword) {
      const taskNodes = this._getTaskNodes(project, keyword);
      nodes.push(...taskNodes);
    }

    // 3. Gerar markdown deduplicado
    let context = this._generateMarkdown(mode, project, keyword, nodes, seenPaths);
    const duration = Date.now() - started;

    // 4. Adicionar footer com metadata
    const footer = `\n\n---\n\n## 📊 Context Metadata\n\n` +
      `- **Mode**: ${mode}\n` +
      `- **Project**: ${project}\n` +
      `- **Keyword**: ${keyword || 'none'}\n` +
      `- **Generated**: ${new Date().toISOString()}\n` +
      `- **Duration**: ${duration}ms\n` +
      `- **Files**: ${seenPaths.size}\n` +
      `- **Size**: ${Math.round(context.length / 1024)}KB\n`;

    return context + footer;
  }

  /**
   * Obter contexto global (mission, standards, padrões)
   */
  _getGlobalNodes() {
    try {
      const stmt = this.db.prepare(`
        SELECT title, content, path FROM memory_nodes 
        WHERE project_id IS NULL 
        AND (
          path LIKE '%mission.md' 
          OR path LIKE '%standards.md'
          OR path LIKE '%ADR-%'
        )
        ORDER BY updated_at DESC
        LIMIT 10
      `);
      return stmt.all() || [];
    } catch (e) {
      console.warn('⚠️ No global nodes found:', e.message);
      return [];
    }
  }

  /**
   * Obter contexto de domínio (vision, design, rules do projeto)
   */
  _getDomainNodes(project: any) {
    try {
      const stmt = this.db.prepare(`
        SELECT DISTINCT n.title, n.content, n.path 
        FROM memory_nodes n
        JOIN projects p ON p.id = n.project_id
        WHERE p.name = ? 
        AND (
          n.path LIKE '%vision.md'
          OR n.path LIKE '%design%'
          OR n.path LIKE '%rules.md'
          OR n.path LIKE '%summary%'
        )
        ORDER BY n.updated_at DESC
        LIMIT 15
      `);
      return stmt.all(project) || [];
    } catch (e) {
      console.warn(`⚠️ No domain nodes found for ${project}:`, e.message);
      return [];
    }
  }

  /**
   * Obter contexto orientado a tarefa (busca por FTS5)
   */
  _getTaskNodes(project: any, keyword: any) {
    try {
      const stmt = this.db.prepare(`
        SELECT DISTINCT n.title, n.content, n.path 
        FROM memory_nodes n
        JOIN projects p ON p.id = n.project_id
        LEFT JOIN search_idx s ON s.node_id = n.id
        WHERE p.name = ? 
        AND (n.content LIKE ? OR s.content MATCH ?)
        ORDER BY n.updated_at DESC
        LIMIT 20
      `);
      const pattern = `%${keyword}%`;
      return stmt.all(project, pattern, keyword) || [];
    } catch (e) {
      console.warn(`⚠️ No task nodes found for "${keyword}":`, e.message);
      return [];
    }
  }

  /**
   * Gerar markdown deduplicado
   */
  _generateMarkdown(mode: any, project: any, keyword: any, nodes: any, seenPaths: any) {
    let md = `# CONTEXT PACK: ${project.toUpperCase()}\n\n`;
    md += `**Mode**: \`${mode}\`\n`;
    if (keyword) md += `**Search**: \`${keyword}\`\n`;
    md += `\n`;

    for (const node of nodes) {
      if (seenPaths.has(node.path)) continue;
      seenPaths.add(node.path);

      md += `## 📄 ${node.title}\n`;
      md += `**Path**: \`${node.path}\`\n\n`;
      md += `${node.content}\n\n`;
      md += `---\n\n`;
    }

    return md;
  }

  /**
   * Salvar contexto em arquivo
   */
  save(content: any, outputPath: any) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, content, 'utf8');
  }

  /**
   * Estatísticas de contexto
   */
  stats(mode: any, project: any, keyword = '') {
    const content = this.build(mode, project, keyword);
    const lines = content.split('\n').length;
    const tokens = Math.round(content.length / 4); // Aproximação simples

    return {
      mode,
      project,
      keyword,
      bytes: content.length,
      lines,
      tokens,
      estimatedCost: (tokens * 0.00001).toFixed(4), // Assumindo $0.00001 por token
    };
  }
}

/**
 * Modo CLI - Executar via node scripts/context-builder.mjs
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const [mode, project, keyword] = process.argv.slice(2);

  if (!mode || !project) {
    console.error('Usage: node context-builder.mjs <mode> <project> [keyword]');
    console.error('Modes: global, domain, task');
    process.exit(1);
  }

  ensureSchema({ silent: true });
  const dbPath = getDbPath();
  const builder = new ContextBuilder(process.cwd(), dbPath);

  try {
    console.log(`🔨 Building ${mode} context for ${project}...`);
    const content = builder.build(mode, project, keyword);
    const stats = builder.stats(mode, project, keyword);

    const outDir = path.join(process.cwd(), '.context');
    const outFile = path.join(outDir, `context-${mode}.md`);

    builder.save(content, outFile);

    console.log(`✅ Context saved: ${outFile}`);
    console.log(`📊 Stats:`, stats);
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  } finally {
    builder.close();
  }
}

export default ContextBuilder;
