/**
 * Testes para lib/generators e lib/validators
 * Executa validação completa da refatoração
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateMemoryStructure } from '../lib/generators/memory-generator.js';
import { generateNestStructure } from '../lib/generators/nest-generator.js';
import { generateReadme } from '../lib/generators/readme-generator.js';
import { validateProjectStructure } from '../lib/validators/structure-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function tempDir() {
  return `/tmp/test-kit-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

// =================================================================
// TESTES: Memory Generator
// =================================================================

console.log('\n📚 Testando Memory Generator...\n');

test('generateMemoryStructure cria arquivos', () => {
  const dir = tempDir();
  const result = generateMemoryStructure(dir, { noGitkeep: true });
  assert(result.success, 'Resultado deve ser sucesso');
  assert(result.filesWritten > 50, `Deve criar >50 arquivos, criou ${result.filesWritten}`);
  assert(fs.existsSync(path.join(dir, 'memory/00-global/mission.md')), 'mission.md deve existir');
});

test('generateMemoryStructure cria diretórios vazios', () => {
  const dir = tempDir();
  generateMemoryStructure(dir, { noGitkeep: true });
  assert(fs.existsSync(path.join(dir, 'memory/30-domains/shared')), 'Dir shared deve existir');
  assert(fs.existsSync(path.join(dir, '.memory/sqlite')), 'Dir SQLite deve existir');
});

test('AGENTS.md é gerado', () => {
  const dir = tempDir();
  generateMemoryStructure(dir, { noGitkeep: true });
  const content = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
  assert(content.includes('pt-BR'), 'AGENTS.md deve mencionar pt-BR');
  assert(content.includes('NestJS'), 'AGENTS.md deve mencionar NestJS');
});

// =================================================================
// TESTES: Nest Generator
// =================================================================

console.log('\n🎭 Testando Nest Generator...\n');

test('generateNestStructure cria arquivos', () => {
  const dir = tempDir();
  const result = generateNestStructure(dir, 'test-project', { noGitkeep: true });
  assert(result.success, 'Resultado deve ser sucesso');
  assert(result.filesWritten > 10, `Deve criar >10 arquivos, criou ${result.filesWritten}`);
});

test('backend/package.json tem nome do projeto', () => {
  const dir = tempDir();
  generateNestStructure(dir, 'meu-projeto', { noGitkeep: true });
  const content = fs.readFileSync(path.join(dir, 'backend/package.json'), 'utf8');
  const pkg = JSON.parse(content);
  assert(pkg.name === 'meu-projeto-api', `Nome deve ser 'meu-projeto-api', foi '${pkg.name}'`);
});

// =================================================================
// TESTES: README Generator
// =================================================================

console.log('\n📖 Testando README Generator...\n');

test('generateReadme cria arquivo', () => {
  const dir = tempDir();
  const result = generateReadme(dir, 'test-project', { noGitkeep: true });
  assert(result.success, 'Resultado deve ser sucesso');
  assert(fs.existsSync(result.path), 'README.md deve existir');
});

// =================================================================
// TESTES: Structure Validator
// =================================================================

console.log('\n🔍 Testando Structure Validator...\n');

test('validateProjectStructure retorna isValid=true para projeto válido', () => {
  const dir = tempDir();
  generateMemoryStructure(dir, { noGitkeep: true });
  generateReadme(dir, 'test', { noGitkeep: true });
  
  const result = validateProjectStructure(dir, { includeNest: false });
  assert(result.isValid === true, `Deve ser válido, erros: ${result.errors.join(', ')}`);
});

// =================================================================
// RESUMO
// =================================================================

console.log(`\n${'='.repeat(60)}`);
console.log(`✅ Passou: ${passed}`);
console.log(`❌ Falhou: ${failed}`);
console.log(`Total: ${passed + failed}`);
console.log(`${'='.repeat(60)}\n`);

if (failed > 0) {
  process.exit(1);
}
