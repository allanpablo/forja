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

/**
 * Termo livre → consulta FTS5 segura: cada palavra vira frase entre aspas. Sem isto, `pix-qr` ou
 * `auth:jwt` são sintaxe FTS inválida e a query inteira lança — e o modo task voltava vazio.
 */
export function ftsQuery(keyword: string): string {
  const terms = String(keyword).split(/\s+/).filter(Boolean).map((t) => `"${t.replace(/"/g, '""')}"`);
  return terms.join(' ') || '""';
}

/**
 * Nó curto entra inteiro (SPEC-057 AC-1). ~400 tokens na régua bytes/4 que o framework usa em todo
 * lugar: abaixo disso, cortar economiza migalha e perde o contexto que dava sentido ao trecho.
 */
export const FULL_CONTENT_MAX_CHARS = Number(process.env.FORJA_CONTEXT_FULL_MAX_CHARS) || 1600;

/** Raio do `snippet()` do FTS5 — em tokens, não em chars: ±24 tokens em volta de cada casamento. */
export const SNIPPET_RADIUS_TOKENS = 24;

/** Marcador de casamento no trecho injetado; o agente vê onde a busca bateu. */
const MARK = '**';

/**
 * Constituição do pack: missão e padrões entram inteiros por tamanho que tenham. Um trecho solto de
 * `standards.md` orienta pior do que nada — é a única classe de nó que o corte piora sempre.
 */
const ALWAYS_FULL_RE = /(?:mission|standards)\.md$/i;

interface MemoryNode {
  title: string;
  path: string;
  content: string;
  /** Trecho casado (FTS `snippet()` ou janela em volta do LIKE). Ausente → cabeça do nó. */
  excerpt?: string;
}

export interface BuildOptions {
  /** `--full-context`: injeta o conteúdo integral de todo nó, sem corte (opt-out do AC-1). */
  full?: boolean;
}

function elision(omitted: number): string {
  return `\n\n> ⋯ ${omitted} chars omitidos — leia o arquivo acima ou rode com \`--full-context\``;
}

/** Cabeça do nó cortada em fronteira de linha: corte no meio de uma linha parece arquivo corrompido. */
export function headExcerpt(content: string, max = FULL_CONTENT_MAX_CHARS): string {
  const cut = content.slice(0, max);
  const nl = cut.lastIndexOf('\n');
  return (nl > 0 ? cut.slice(0, nl) : cut).trimEnd();
}

/**
 * Janela em volta da primeira ocorrência do termo — para os nós que o LIKE acha e o FTS não (o
 * porter não casa substring no meio de palavra, e é justamente esse o caso que cai aqui). O raio é o
 * mesmo do `snippet()` em chars (tokens × 4, a régua do repo): dois produtores de trecho, um orçamento.
 */
export function excerptAround(content: string, needle: string, radius = SNIPPET_RADIUS_TOKENS * 4): string {
  const at = needle ? content.toLowerCase().indexOf(needle.toLowerCase()) : -1;
  if (at < 0) return headExcerpt(content);

  let start = Math.max(0, at - radius);
  let end = Math.min(content.length, at + needle.length + radius);
  if (start > 0) {
    const word = /^\S*/.exec(content.slice(start))?.[0].length ?? 0;
    start = Math.min(at, start + word);
  }
  if (end < content.length) {
    const word = /\S*$/.exec(content.slice(0, end))?.[0].length ?? 0;
    end = Math.max(at + needle.length, end - word);
  }
  const prefix = start > 0 ? '… ' : '';
  const suffix = end < content.length ? ' …' : '';
  return prefix + content.slice(start, end).trim() + suffix;
}

/**
 * O que entra no pack por nó. Retorna também quantos chars ficaram de fora — a omissão é sempre
 * visível, porque corte calado é o agente raciocinando sobre metade da regra e não sabendo.
 */
export function nodeBody(node: MemoryNode, opts: BuildOptions = {}): { text: string; omitted: number } {
  const total = node.content.length;
  if (opts.full || total <= FULL_CONTENT_MAX_CHARS || ALWAYS_FULL_RE.test(node.path)) {
    return { text: node.content, omitted: 0 };
  }
  const text = node.excerpt ?? headExcerpt(node.content);
  const kept = text.replaceAll(MARK, '').replaceAll('…', '').trim().length;
  const omitted = Math.max(0, total - kept);
  return { text: text + elision(omitted), omitted };
}

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
  build(mode: any, project: any, keyword = '', opts: BuildOptions = {}) {
    this.connect();
    
    const started = Date.now();
    const nodes: MemoryNode[] = [];
    const seenPaths = new Set<string>();

    // 1. Contexto global obrigatório
    const globalNodes = this._getGlobalNodes(project);
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
    const { markdown: context, shown, excerpted } = this._generateMarkdown(mode, project, keyword, nodes, seenPaths, opts);
    const duration = Date.now() - started;

    // 4. Adicionar footer com metadata
    const footer = `\n\n---\n\n## 📊 Context Metadata\n\n` +
      `- **Mode**: ${mode}\n` +
      `- **Project**: ${project}\n` +
      `- **Keyword**: ${keyword || 'none'}\n` +
      `- **Generated**: ${new Date().toISOString()}\n` +
      `- **Duration**: ${duration}ms\n` +
      `- **Files**: ${seenPaths.size}\n` +
      `- **Excerpts**: ${excerpted}/${shown} nodes\n` +
      `- **Size**: ${Math.round(context.length / 1024)}KB\n`;

    return context + footer;
  }

  /**
   * Obter contexto global (mission, standards, padrões)
   */
  _getGlobalNodes(project = '') {
    try {
      // Globais do workspace (project_id NULL) + fundação do próprio projeto: no modo embedded a
      // missão, os padrões e as ADRs vivem no projeto, não num nível global separado.
      const stmt = this.db.prepare(`
        SELECT title, content, path FROM memory_nodes
        WHERE (project_id IS NULL OR project_id = (SELECT id FROM projects WHERE name = ?))
        AND (
          path LIKE '%mission.md' 
          OR path LIKE '%standards.md'
          OR path LIKE '%ADR-%'
        )
        ORDER BY updated_at DESC
        LIMIT 10
      `);
      return stmt.all(project) || [];
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
   *
   * Duas consultas, não uma: a do FTS já devolve o trecho casado via `snippet()` — injetar o nó
   * inteiro era o maior sorvedouro de token do pack (SPEC-057). O `LIKE` cobre o que o porter não
   * casa (substring no meio de palavra) e ganha uma janela calculada aqui, porque fora do FTS não
   * existe `snippet()` para destacar o casamento.
   */
  _getTaskNodes(project: any, keyword: any, limit = 20): MemoryNode[] {
    const fts = this._ftsTaskNodes(project, keyword, limit);
    if (fts.length >= limit) return fts;
    return [...fts, ...this._likeTaskNodes(project, keyword, ftsQuery(keyword), limit - fts.length)];
  }

  _ftsTaskNodes(project: string, keyword: string, limit: number): MemoryNode[] {
    try {
      const stmt = this.db.prepare(`
        SELECT n.title, n.path, n.content,
               snippet(search_idx, 2, '${MARK}', '${MARK}', ' … ', ?) AS excerpt
        FROM search_idx
        JOIN memory_nodes n ON n.id = search_idx.node_id
        JOIN projects p ON p.id = n.project_id
        WHERE search_idx MATCH ? AND p.name = ?
        ORDER BY rank
        LIMIT ?
      `);
      return stmt.all(SNIPPET_RADIUS_TOKENS, ftsQuery(keyword), project, limit) || [];
    } catch (e) {
      console.warn(`⚠️ No task nodes found for "${keyword}":`, e.message);
      return [];
    }
  }

  _likeTaskNodes(project: string, keyword: string, fts: string, limit: number): MemoryNode[] {
    if (limit <= 0) return [];
    try {
      const stmt = this.db.prepare(`
        SELECT n.title, n.path, n.content
        FROM memory_nodes n
        JOIN projects p ON p.id = n.project_id
        WHERE p.name = ? AND n.content LIKE ?
        AND n.id NOT IN (SELECT node_id FROM search_idx WHERE search_idx MATCH ?)
        ORDER BY n.updated_at DESC
        LIMIT ?
      `);
      const rows: MemoryNode[] = stmt.all(project, `%${keyword}%`, fts, limit) || [];
      return rows.map((n) => ({ ...n, excerpt: excerptAround(n.content, keyword) }));
    } catch (e) {
      console.warn(`⚠️ No task nodes found for "${keyword}":`, e.message);
      return [];
    }
  }

  /**
   * Gerar markdown deduplicado
   */
  _generateMarkdown(mode: any, project: any, keyword: any, nodes: MemoryNode[], seenPaths: Set<string>, opts: BuildOptions = {}) {
    let md = `# CONTEXT PACK: ${project.toUpperCase()}\n\n`;
    md += `**Mode**: \`${mode}\`\n`;
    if (keyword) md += `**Search**: \`${keyword}\`\n`;
    md += `\n`;

    let shown = 0;
    let excerpted = 0;
    for (const node of nodes) {
      if (seenPaths.has(node.path)) continue;
      seenPaths.add(node.path);

      const body = nodeBody(node, opts);
      if (body.omitted > 0) excerpted++;
      shown++;

      md += `## 📄 ${node.title}\n`;
      md += `**Path**: \`${node.path}\`\n\n`;
      md += `${body.text}\n\n`;
      md += `---\n\n`;
    }

    return { markdown: md, shown, excerpted };
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
  stats(mode: any, project: any, keyword = '', opts: BuildOptions = {}) {
    const content = this.build(mode, project, keyword, opts);
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

export default ContextBuilder;
