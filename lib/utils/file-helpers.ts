import fs from 'node:fs';
import path from 'node:path';

/**
 * Funções utilitárias compartilhadas para geração de arquivos
 */

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function writeFileSafe(filePath, content, options: { force?: boolean } = {}) {
  const { force = false } = options;
  if (fs.existsSync(filePath) && !force) {
    throw new Error(`Arquivo ja existe: ${filePath}. Use --force para sobrescrever.`);
  }
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

export function maybeGitkeep(dirPath, options: { noGitkeep?: boolean } = {}) {
  const { noGitkeep = false } = options;
  if (noGitkeep) return;
  const keepFile = path.join(dirPath, '.gitkeep');
  if (!fs.existsSync(keepFile)) {
    fs.writeFileSync(keepFile, '', 'utf8');
  }
}

export function log(message) {
  console.log(message);
}

export function logError(message) {
  console.error(`❌ ${message}`);
}

export function logSuccess(message) {
  console.log(`✅ ${message}`);
}
