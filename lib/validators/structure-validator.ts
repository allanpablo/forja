/**
 * Structure Validator - Valida integridade da estrutura gerada
 * Garante que todos os diretórios e arquivos críticos foram criados
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Lista dos arquivos críticos que devem existir
 */
const CRITICAL_FILES = [
  'memory/00-global/mission.md',
  'memory/00-global/standards.md',
  'memory/10-product/vision.md',
  'memory/20-architecture/backend.md',
  'memory/40-delivery/current-sprint.md',
  'memory/50-orchestration/topology.md',
  'AGENTS.md',
  '.memoryrc.json',
];

/**
 * Lista de diretórios críticos
 */
const CRITICAL_DIRS = [
  'memory',
  'memory/00-global',
  'memory/10-product',
  'memory/20-architecture',
  'memory/30-domains',
  'memory/40-delivery',
  'memory/50-orchestration',
  'memory/60-runs',
  'memory/70-summaries',
  'agents',
  'skills',
  'prompts',
  '.memory/sqlite',
];

/**
 * Validações específicas do NestJS backend
 */
const NEST_CRITICAL_FILES = [
  'backend/package.json',
  'backend/src/main.ts',
  'backend/src/app.module.ts',
  'backend/src/app.controller.ts',
  'backend/src/app.service.ts',
  'backend/tsconfig.json',
];

const NEST_CRITICAL_DIRS = [
  'backend/src',
  'backend/src/modules/ops',
  'backend/test',
  'backend/scripts',
];

/**
 * Valida estrutura de memória
 * @param {string} baseDir - Diretório base
 * @returns {Object} Resultado da validação
 */
export function validateMemoryStructure(baseDir: any) {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validar arquivos críticos
  for (const filePath of CRITICAL_FILES) {
    const abs = path.join(baseDir, filePath);
    if (!fs.existsSync(abs)) {
      errors.push(`Arquivo crítico não encontrado: ${filePath}`);
    }
  }

  // Validar diretórios críticos
  for (const dirPath of CRITICAL_DIRS) {
    const abs = path.join(baseDir, dirPath);
    if (!fs.existsSync(abs)) {
      errors.push(`Diretório crítico não encontrado: ${dirPath}`);
    } else if (!fs.statSync(abs).isDirectory()) {
      errors.push(`Não é um diretório: ${dirPath}`);
    }
  }

  // Validar conteúdo de mission.md
  const missionPath = path.join(baseDir, 'memory/00-global/mission.md');
  if (fs.existsSync(missionPath)) {
    const content = fs.readFileSync(missionPath, 'utf8');
    if (!content.includes('Missao') && !content.includes('Missão')) {
      warnings.push('mission.md parece estar vazio ou incorreto');
    }
  }

  // Validar .memoryrc.json é JSON válido
  const memoryrcPath = path.join(baseDir, '.memoryrc.json');
  if (fs.existsSync(memoryrcPath)) {
    try {
      const content = fs.readFileSync(memoryrcPath, 'utf8');
      JSON.parse(content);
    } catch (e) {
      errors.push('.memoryrc.json é JSON inválido');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    checklist: {
      memoryStructure: CRITICAL_DIRS.length,
      memoryFiles: CRITICAL_FILES.length,
    },
  };
}

/**
 * Valida estrutura NestJS
 * @param {string} baseDir - Diretório base
 * @returns {Object} Resultado da validação
 */
export function validateNestStructure(baseDir: any) {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validar arquivos críticos do NestJS
  for (const filePath of NEST_CRITICAL_FILES) {
    const abs = path.join(baseDir, filePath);
    if (!fs.existsSync(abs)) {
      errors.push(`Arquivo NestJS não encontrado: ${filePath}`);
    }
  }

  // Validar diretórios críticos do NestJS
  for (const dirPath of NEST_CRITICAL_DIRS) {
    const abs = path.join(baseDir, dirPath);
    if (!fs.existsSync(abs)) {
      errors.push(`Diretório NestJS não encontrado: ${dirPath}`);
    }
  }

  // Validar package.json
  const pkgPath = path.join(baseDir, 'backend/package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (!pkg.dependencies['@nestjs/common']) {
        errors.push('package.json não contém @nestjs/common');
      }
    } catch (e) {
      errors.push('backend/package.json é JSON inválido');
    }
  }

  // Validar tsconfig.json
  const tsconfigPath = path.join(baseDir, 'backend/tsconfig.json');
  if (fs.existsSync(tsconfigPath)) {
    try {
      JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
    } catch (e) {
      errors.push('backend/tsconfig.json é JSON inválido');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    checklist: {
      nestDirectories: NEST_CRITICAL_DIRS.length,
      nestFiles: NEST_CRITICAL_FILES.length,
    },
  };
}

/**
 * Valida estrutura completa do projeto
 * @param {string} baseDir - Diretório base
 * @param {Object} options - Opções { includeNest: boolean }
 * @returns {Object} Resultado completo
 */
export function validateProjectStructure(baseDir: any, options: { includeNest?: boolean } = {}) {
  const { includeNest = false } = options;

  const memoryResult = validateMemoryStructure(baseDir);
  const results: { memory: any; nest?: any } = { memory: memoryResult };

  if (includeNest) {
    results.nest = validateNestStructure(baseDir);
  }

  const allErrors = [
    ...memoryResult.errors,
    ...(results.nest?.errors || []),
  ];

  return {
    isValid: allErrors.length === 0,
    errors: allErrors,
    warnings: [
      ...memoryResult.warnings,
      ...(results.nest?.warnings || []),
    ],
    results,
    summary: {
      totalErrors: allErrors.length,
      hasNest: includeNest,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Imprime relatório de validação de forma amigável
 * @param {Object} report - Resultado de validateProjectStructure
 */
export function printValidationReport(report: any) {
  if (report.isValid) {
    console.log('✅ Estrutura do projeto é válida!');
  } else {
    console.log('❌ Estrutura do projeto tem problemas:');
    console.log('');
    for (const error of report.errors) {
      console.log(`  ❌ ${error}`);
    }
  }

  if (report.warnings.length > 0) {
    console.log('');
    console.log('⚠️  Avisos:');
    for (const warning of report.warnings) {
      console.log(`  ⚠️  ${warning}`);
    }
  }

  if (report.summary) {
    console.log('');
    console.log(`📊 Verificado em: ${report.summary.timestamp}`);
  }
}

export default {
  validateProjectStructure,
  validateMemoryStructure,
  validateNestStructure,
  printValidationReport,
  CRITICAL_FILES,
  CRITICAL_DIRS,
  NEST_CRITICAL_FILES,
  NEST_CRITICAL_DIRS,
};
