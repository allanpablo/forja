import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { ensureSchema, getDbPath } from './memory-schema.mjs';
import {
  initWorkspace,
  getProjectsDir,
  getWorkspaceSpecsDir,
  getWorkspaceProjectsMemoryDir,
} from '../lib/workspace.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

initWorkspace();
const dbPath = getDbPath();
const args = process.argv.slice(2);
const projectArgIndex = args.indexOf('--project');
const onlyProject = projectArgIndex >= 0 ? args[projectArgIndex + 1] : null;
const syncGlobal = !onlyProject || args.includes('--global');
const syncProjects = !args.includes('--global') || Boolean(onlyProject);

// Schema simplificado para a Memória Universal
const schema = `
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER, -- NULL se for global
  path TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL, -- 'global', 'project', 'domain', 'adr', 'summary'
  title TEXT,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE VIRTUAL TABLE IF NOT EXISTS search_idx USING fts5(
  node_id UNINDEXED,
  title,
  content,
  tokenize='porter'
);
`;

function log(msg, level = 'info') {
  const prefix = { info: 'INFO', success: 'OK', warn: 'WARN', error: 'ERROR' }[level] || 'INFO';
  console.log(`${prefix} ${msg}`);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.memory') continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(abs);
  }
  return out;
}

const dbDir = path.dirname(dbPath);
ensureDir(dbDir);
ensureSchema({ silent: true });
const db = new Database(dbPath);
db.exec(schema);

const upsertProject = db.prepare('INSERT INTO projects (name, path, created_at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET path=excluded.path');
const upsertNode = db.prepare('INSERT INTO memory_nodes (project_id, path, kind, title, content, content_hash, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET content=excluded.content, content_hash=excluded.content_hash, updated_at=excluded.updated_at');
const getProjectId = db.prepare('SELECT id FROM projects WHERE name = ?');
const deleteFts = db.prepare('DELETE FROM search_idx WHERE node_id = ?');
const insertFts = db.prepare('INSERT INTO search_idx (node_id, title, content) VALUES (?, ?, ?)');
const upsertSpecSummary = db.prepare(`
  INSERT INTO spec_summaries (slug, status, title, summary, source_path, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(slug) DO UPDATE SET
    status=excluded.status,
    title=excluded.title,
    summary=excluded.summary,
    source_path=excluded.source_path,
    updated_at=excluded.updated_at
`);
const upsertAsset = db.prepare(`
  INSERT INTO asset_catalog (type, name, path, summary, tags, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(path) DO UPDATE SET
    type=excluded.type,
    name=excluded.name,
    summary=excluded.summary,
    tags=excluded.tags,
    updated_at=excluded.updated_at
`);

const now = new Date().toISOString();

function getKind(relPath) {
  if (relPath.startsWith('memory/00-global')) return 'global';
  if (relPath.includes('/design-md/') || relPath.startsWith('design-md/')) return 'design';
  if (relPath.includes('90-decisions')) return 'adr';
  if (relPath.includes('70-summaries')) return 'summary';
  if (relPath.includes('30-domains')) return 'domain';
  return 'general';
}

function firstHeading(content, fallback) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

function specStatus(content) {
  const match = content.match(/-\s+\*\*Status\*\*:\s+([^\n]+)/);
  return match ? match[1].trim() : 'unknown';
}

function extractSection(content, heading, maxChars = 1200) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^##\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=^##\\s+|$)`, 'm');
  const match = content.match(re);
  return match ? match[1].trim().slice(0, maxChars) : '';
}

function summarizeReadme(relPath) {
  const full = path.join(root, relPath);
  if (!fs.existsSync(full)) return null;
  const content = fs.readFileSync(full, 'utf8');
  return content.split('\n')
    .filter((line) => line.trim() && !line.startsWith('```'))
    .slice(0, 10)
    .join(' ')
    .replace(/\s+/g, ' ')
    .slice(0, 450);
}

function readJson(relPath) {
  const full = path.join(root, relPath);
  if (!fs.existsSync(full)) return null;
  try {
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch {
    return null;
  }
}

function syncSpecSummaries() {
  const specsDir = path.join(root, 'specs');
  if (!fs.existsSync(specsDir)) return;
  let count = 0;
  for (const entry of fs.readdirSync(specsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
    const slug = entry.name;
    const rel = path.join('specs', slug, 'spec.md');
    const full = path.join(root, rel);
    if (!fs.existsSync(full)) continue;
    const content = fs.readFileSync(full, 'utf8');
    const title = firstHeading(content, slug);
    const status = specStatus(content);
    const summary = [
      `## Problema\n${extractSection(content, '1. Problema', 900)}`,
      `## Valor\n${extractSection(content, '2. Proposta de valor', 700)}`,
      `## AC\n${extractSection(content, '4. Criterios de aceite', 1200) || extractSection(content, '4. Critérios de aceite', 1200)}`,
    ].join('\n\n').slice(0, 3500);
    upsertSpecSummary.run(slug, status, title, summary, rel, now);
    count++;
  }
  log(`Spec summaries sincronizados: ${count}`, 'info');
}

function syncAssetCatalog() {
  const assets = [];
  const boilerRoot = path.join(root, 'boilerplates');
  if (fs.existsSync(boilerRoot)) {
    for (const entry of fs.readdirSync(boilerRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const rel = path.join('boilerplates', entry.name, 'README.md');
      const summary = summarizeReadme(rel);
      if (!summary) continue;
      const manifest = readJson(path.join('boilerplates', entry.name, 'boilerplate.manifest.json'));
      const tags = manifest ? [...(manifest.stack || []), ...(manifest.useCases || [])].join(',') : firstHeading(summary, entry.name);
      assets.push({ type: 'boilerplate', name: entry.name, path: rel, summary, tags });
    }
  }
  const designRoot = path.join(root, 'design-md');
  if (fs.existsSync(designRoot)) {
    for (const entry of fs.readdirSync(designRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const rel = path.join('design-md', entry.name, 'README.md');
      const summary = summarizeReadme(rel);
      if (!summary) continue;
      const manifest = readJson(path.join('design-md', entry.name, 'design.manifest.json'));
      const tags = manifest ? [...(manifest.surfaces || []), ...(manifest.traits || [])].join(',') : entry.name;
      assets.push({ type: 'design-reference', name: entry.name, path: rel, summary, tags });
    }
  }
  for (const asset of assets) {
    upsertAsset.run(asset.type, asset.name, asset.path, asset.summary, asset.tags, now);
  }
  log(`Asset catalog sincronizado: ${assets.length}`, 'info');
}

function syncFiles(files, projectId = null) {
  for (const abs of files) {
    const rel = path.relative(root, abs);
    const raw = fs.readFileSync(abs, 'utf8');
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    const titleMatch = raw.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : path.basename(rel, '.md');

    try {
      const result = upsertNode.run(projectId, rel, getKind(rel), title, raw, hash, now);
      const nodeId = result.lastInsertRowid || db.prepare('SELECT id FROM memory_nodes WHERE path = ?').get(rel).id;
      
      deleteFts.run(nodeId);
      insertFts.run(nodeId, title, raw);
    } catch (e) {
      log(`Erro sincronizando ${rel}: ${e.message}`, 'error');
    }
  }
}

// 1. Sincronizar Memória/Docs/Prompts Globais
if (syncGlobal) {
  log('Sincronizando Memória Global...', 'info');
  const globalFiles = [
    ...walk(path.join(root, 'memory')),
    ...walk(path.join(root, 'docs')),
    ...walk(path.join(root, 'prompts')),
  ];
  syncFiles(globalFiles);
  syncSpecSummaries();
  syncAssetCatalog();
}

// 2. Sincronizar Projetos do Workspace
const projectsDir = getProjectsDir();
if (syncProjects && fs.existsSync(projectsDir)) {
  const projects = fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .filter(e => !onlyProject || e.name === onlyProject);
  if (onlyProject && projects.length === 0) {
    log(`Projeto nao encontrado para sync: ${onlyProject}`, 'warn');
  }
  for (const p of projects) {
    log(`Sincronizando Projeto: ${p.name}...`, 'info');
    const projectPath = path.join(projectsDir, p.name);
    upsertProject.run(p.name, projectPath, now);
    const pid = getProjectId.get(p.name).id;

    // Indexa memória, documentação, spec SDD e referências de design do projeto (somente .md)
    const projectMemFiles = walk(path.join(projectPath, 'memory'));
    const projectDocsFiles = walk(path.join(projectPath, 'docs'));
    const projectSpecFiles = walk(path.join(getWorkspaceSpecsDir(), p.name));
    const projectDesignFiles = walk(path.join(projectPath, 'design-md'));
    syncFiles([...projectMemFiles, ...projectDocsFiles, ...projectSpecFiles, ...projectDesignFiles], pid);
  }
}

// 3. Sincronizar fichas de projetos no workspace memory/30-projects
const workspaceProjectsMemoryDir = getWorkspaceProjectsMemoryDir();
if (fs.existsSync(workspaceProjectsMemoryDir)) {
  const fichaFiles = walk(workspaceProjectsMemoryDir);
  syncFiles(fichaFiles);
}

db.close();
log('Sincronização Universal Concluída!', 'success');
