/**
 * lib/workspace.mjs
 *
 * Centraliza a resolução de caminhos do workspace Forja.
 *
 * Regras de prioridade para descobrir o workspace:
 *   1. Variável de ambiente FORJA_WORKSPACE
 *   2. Arquivo ~/.forjarc.json (campo workspaceRoot)
 *   3. Default: ~/forja-workspace
 *
 * O workspace é o "canto fixo" onde projetos de produto vivem:
 *   ~/forja-workspace/
 *     projects/              # projetos gerados
 *     memory/                # memória universal do workspace
 *       sqlite/universal.db  # SQLite FTS5
 *       30-projects/         # fichas de projetos
 *     specs/                 # specs de produto
 *     .context/              # runbooks GSD de produto
 *     .forjarc.json          # config local do workspace (opcional)
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_WORKSPACE_NAME = 'forja-workspace';

function getHomeDir() {
  return os.homedir();
}

function readJsonSafe(filePath: any) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getUserConfigPath() {
  return path.join(getHomeDir(), '.forjarc.json');
}

export function getWorkspaceRoot() {
  if (process.env.FORJA_WORKSPACE) {
    return path.resolve(process.env.FORJA_WORKSPACE);
  }

  const userConfig = readJsonSafe(getUserConfigPath());
  if (userConfig?.workspaceRoot) {
    return path.resolve(userConfig.workspaceRoot);
  }

  return path.join(getHomeDir(), DEFAULT_WORKSPACE_NAME);
}

export function getWorkspaceInfo() {
  const root = getWorkspaceRoot();
  return {
    root,
    source: process.env.FORJA_WORKSPACE
      ? 'FORJA_WORKSPACE'
      : fs.existsSync(getUserConfigPath())
        ? '~/.forjarc.json'
        : 'default',
    exists: fs.existsSync(root),
  };
}

export function getProjectsDir() {
  return path.join(getWorkspaceRoot(), 'projects');
}

export function getWorkspaceMemoryDir() {
  return path.join(getWorkspaceRoot(), 'memory');
}

export function getWorkspaceDbDir() {
  return path.join(getWorkspaceMemoryDir(), 'sqlite');
}

export function getWorkspaceDbPath() {
  return path.join(getWorkspaceDbDir(), 'universal.db');
}

export function getWorkspaceProjectsMemoryDir() {
  return path.join(getWorkspaceMemoryDir(), '30-projects');
}

export function getWorkspaceSpecsDir() {
  return path.join(getWorkspaceRoot(), 'specs');
}

export function getWorkspaceContextDir() {
  return path.join(getWorkspaceRoot(), '.context');
}

export function resolveProject(name: any) {
  if (!name || typeof name !== 'string') {
    throw new Error('Nome do projeto é obrigatório');
  }
  const safe = name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  if (!safe) {
    throw new Error(`Nome de projeto inválido: ${name}`);
  }
  return path.join(getProjectsDir(), safe);
}

export function listProjects() {
  const dir = getProjectsDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

export function ensureDir(dir: any) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function initWorkspace() {
  const root = ensureDir(getWorkspaceRoot());
  ensureDir(getProjectsDir());
  ensureDir(getWorkspaceMemoryDir());
  ensureDir(getWorkspaceDbDir());
  ensureDir(getWorkspaceProjectsMemoryDir());
  ensureDir(getWorkspaceSpecsDir());
  ensureDir(getWorkspaceContextDir());

  // Cria README de convenção no workspace
  const readmePath = path.join(root, 'README.md');
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(
      readmePath,
      `# Forja Workspace

Este é o workspace de produção do Forja. Aqui vivem projetos gerados, memória universal e specs de produto.

## Estrutura

- \`projects/\` — projetos gerados pelo Forja.
- \`memory/sqlite/universal.db\` — memória universal indexada (SQLite + FTS5).
- \`memory/30-projects/\` — fichas dos projetos.
- \`specs/\` — specs de produto.
- \`.context/\` — runbooks GSD de produto.

## Configuração

O caminho do workspace é resolvido por prioridade:

1. Variável \`FORJA_WORKSPACE\`
2. Campo \`workspaceRoot\` em \`~/.forjarc.json\`
3. Padrão: \`~/forja-workspace\`

## Comandos úteis

- \`npm run dev -- workspace:init\` — recria estrutura base.
- \`npm run dev -- project:new <nome>\` — cria novo projeto.
- \`npm run dev -- project:list\` — lista projetos.
- \`npm run dev -- project:check <nome>\` — valida padrões.
`,
      'utf8'
    );
  }

  // Cria .forjarc.json local apenas se não houver config global
  const localConfigPath = path.join(root, '.forjarc.json');
  if (!fs.existsSync(localConfigPath) && !fs.existsSync(getUserConfigPath()) && !process.env.FORJA_WORKSPACE) {
    fs.writeFileSync(
      localConfigPath,
      JSON.stringify({ workspaceRoot: root }, null, 2) + '\n',
      'utf8'
    );
  }

  // Cria README em 30-projects
  const projectsMemoryReadme = path.join(getWorkspaceProjectsMemoryDir(), 'README.md');
  if (!fs.existsSync(projectsMemoryReadme)) {
    fs.writeFileSync(
      projectsMemoryReadme,
      `# Projetos do Workspace

Fichas de projetos gerados pelo Forja. Cada arquivo representa um produto ativo ou arquivado.
`,
      'utf8'
    );
  }

  return root;
}

export function isInsideFrameworkRepo(filePath: any) {
  const frameworkRoot = path.resolve(__dirname, '..');
  const resolved = path.resolve(filePath);
  return resolved === frameworkRoot || resolved.startsWith(frameworkRoot + path.sep);
}

export function assertOutsideFrameworkRepo(filePath: any, operation = 'operacao') {
  if (isInsideFrameworkRepo(filePath)) {
    throw new Error(
      `${operation} não pode ser executada dentro do repositório do framework Forja. Use o workspace externo (~/forja-workspace).`
    );
  }
}
