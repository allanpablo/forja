import fs from 'node:fs';
import path from 'node:path';

/**
 * Funções utilitárias compartilhadas para geração de arquivos
 */

export function ensureDir(dirPath: any) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function writeFileSafe(filePath: any, content: any, options: { force?: boolean } = {}) {
  const { force = false } = options;
  if (fs.existsSync(filePath) && !force) {
    throw new Error(`Arquivo ja existe: ${filePath}. Use --force para sobrescrever.`);
  }
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

export function maybeGitkeep(dirPath: any, options: { noGitkeep?: boolean } = {}) {
  const { noGitkeep = false } = options;
  if (noGitkeep) return;
  const keepFile = path.join(dirPath, '.gitkeep');
  if (!fs.existsSync(keepFile)) {
    fs.writeFileSync(keepFile, '', 'utf8');
  }
}

export function log(message: any) {
  console.log(message);
}

export function logError(message: any) {
  console.error(`❌ ${message}`);
}

export function logSuccess(message: any) {
  console.log(`✅ ${message}`);
}
