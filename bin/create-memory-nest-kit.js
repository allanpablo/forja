#!/usr/bin/env node
/**
 * create-memory-nest-kit v0.6.0
 * Orquestrador de geração de projetos com memória hierárquica
 * 
 * Refatoração modular:
 * - lib/generators/memory-generator.js
 * - lib/generators/nest-generator.js
 * - lib/generators/readme-generator.js
 * - lib/validators/structure-validator.js
 * - lib/utils/file-helpers.js
 */

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { generateMemoryStructure } from '../lib/generators/memory-generator.js';
import { generateNestStructure } from '../lib/generators/nest-generator.js';
import { generateReadme } from '../lib/generators/readme-generator.js';
import { validateProjectStructure, printValidationReport } from '../lib/validators/structure-validator.js';
import { ensureDir, logSuccess, logError } from '../lib/utils/file-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse arguments
const args = process.argv.slice(2);
const showHelp = args.includes('--help') || args.includes('-h');

if (showHelp) {
  console.log(`
create-memory-nest-kit v0.6.0

Uso:
  create-memory-nest-kit [diretorio] [opcoes]

Opcoes:
  --force         Sobrescreve arquivos existentes
  --only-memory   Gera apenas estrutura de memoria/agents/skills
  --no-gitkeep    Nao cria .gitkeep em diretorios vazios
  --no-validate   Pula validacao apos geracao
  -h, --help      Mostra esta ajuda

Exemplos:
  node bin/create-memory-nest-kit.js meu-projeto
  node bin/create-memory-nest-kit.js meu-projeto --force
  node bin/create-memory-nest-kit.js meu-projeto --only-memory
`);
  process.exit(0);
}

const options = {
  force: args.includes('--force'),
  noGitkeep: args.includes('--no-gitkeep'),
  onlyMemory: args.includes('--only-memory'),
  noValidate: args.includes('--no-validate'),
};

const rawTarget = args.find((a) => !a.startsWith('-')) || '.';
const targetDir = path.resolve(process.cwd(), rawTarget);
const projectName = path.basename(targetDir);

/**
 * Orquestrador principal
 */
async function run() {
  try {
    console.log(`\n📦 create-memory-nest-kit v0.6.0`);
    console.log(`📁 Projeto: ${projectName}`);
    console.log(`📍 Diretório: ${targetDir}\n`);

    // Passo 1: Garantir diretório
    console.log('🔨 Criando estrutura de diretórios...');
    ensureDir(targetDir);

    // Passo 2: Gerar memória
    console.log('📚 Gerando estrutura de memória...');
    const memoryResult = generateMemoryStructure(targetDir, options);
    console.log(`   ✅ ${memoryResult.filesWritten} arquivos | ${memoryResult.emptyDirsCreated} diretórios`);

    // Passo 3: Gerar NestJS (se não for --only-memory)
    if (!options.onlyMemory) {
      console.log('🎭 Gerando backend NestJS...');
      const nestResult = generateNestStructure(targetDir, projectName, options);
      console.log(`   ✅ ${nestResult.filesWritten} arquivos | ${nestResult.emptyDirsCreated} diretórios`);
    }

    // Passo 4: Gerar README
    console.log('📖 Gerando README.md...');
    const readmeResult = generateReadme(targetDir, projectName, options);
    console.log(`   ✅ ${Math.round(readmeResult.size / 1024)}KB`);

    // Passo 5: Validar (se não for --no-validate)
    if (!options.noValidate) {
      console.log('\n🔍 Validando estrutura...');
      const validation = validateProjectStructure(targetDir, { includeNest: !options.onlyMemory });
      printValidationReport(validation);

      if (!validation.isValid) {
        logError('Falhas detectadas na validação');
        process.exit(1);
      }
    }

    // Sucesso!
    logSuccess(`Estrutura v0.6.0 criada com sucesso`);
    console.log(`\n➡️  Próximos passos:`);
    console.log(`   1) cd ${path.relative(process.cwd(), targetDir) || '.'}`);
    console.log(`   2) node scripts/build-context-pack.mjs`);
    if (!options.onlyMemory) {
      console.log(`   3) cd backend && npm install`);
      console.log(`   4) npm run start:dev`);
    }
    console.log('');

  } catch (error) {
    logError(error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

run();
