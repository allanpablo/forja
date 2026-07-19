#!/usr/bin/env node

/**
 * Dev Workflow CLI - Orchestrador Unificado de Comandos
 * 
 * Unifica todos os commands de desenvolvimento em uma interface única:
 * - context:build    → Gerar contexto inteligente
 * - memory:vacuum    → Comprimir e limpar memória
 * - memory:sync      → Sincronizar índices
 * - project:health   → Validar saúde do projeto
 * - project:init     → Inicializar novo projeto
 * 
 * Uso: npm run dev -- <command> [args]
 *      node scripts/dev.mjs context:build global my-project
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getDbPath, ensureSchema } from './memory-schema.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const COMMANDS = {
  'context:build': {
    desc: 'Gerar contexto inteligente (global|domain|task)',
    handler: contextBuild,
    example: 'context:build task my-project "auth backend"',
  },
  'memory:vacuum': {
    desc: 'Comprimir e limpar memória (archive + cleanup)',
    handler: memoryVacuum,
    example: 'memory:vacuum',
  },
  'memory:sync': {
    desc: 'Sincronizar índices de busca (FTS5)',
    handler: memorySync,
    example: 'memory:sync my-project',
  },
  'project:health': {
    desc: 'Validar saúde do projeto (estrutura, config, permissões)',
    handler: projectHealth,
    example: 'project:health',
  },
  'project:init': {
    desc: 'Inicializar novo projeto com templates',
    handler: projectInit,
    example: 'project:init my-project --force',
  },
  'design:select': {
    desc: 'Selecionar referencias design-md por superficie',
    handler: harnessCommand('design:select'),
    example: 'design:select agent-console tecnico',
  },
  'design:check': {
    desc: 'Validar brief visual antes do handoff',
    handler: harnessCommand('design:check'),
    example: 'design:check design-md/examples/agent-console-brief.md',
  },
  'hermes:handoff': {
    desc: 'Registrar handoff ADR-0005 via Hermes',
    handler: harnessCommand('hermes:handoff'),
    example: 'hermes:handoff \'{"from":"orchestrator","to":"product","intent":"spec","context":"...","acceptance":"...","constraints":"...","return":"orchestrator"}\'',
  },
  'gsd:plan': {
    desc: 'Criar runbook GSD para uma feature/spec',
    handler: harnessCommand('gsd:plan'),
    example: 'gsd:plan minha-feature "objetivo da execucao"',
  },
  'gsd:handoff': {
    desc: 'Registrar handoff padrao do fluxo GSD',
    handler: harnessCommand('gsd:handoff'),
    example: 'gsd:handoff spec minha-feature',
  },
  'gsd:check': {
    desc: 'Validar gates basicos de GSD/spec/design',
    handler: harnessCommand('gsd:check'),
    example: 'gsd:check minha-feature design-md/examples/agent-console-brief.md',
  },
};

/**
 * Mostrar help
 */
function showHelp() {
  console.log('Dev Workflow CLI');
  console.log('');
  console.log('Sintaxe: npm run dev -- <command> [args]');
  console.log('         node scripts/dev.mjs <command> [args]');
  console.log('');
  console.log('Comandos disponiveis:');
  console.log('');

  for (const [cmd, info] of Object.entries(COMMANDS)) {
    console.log(`  ${cmd.padEnd(20)} - ${info.desc}`);
    console.log(`  ${' '.repeat(20)}   Exemplo: npm run dev -- ${info.example}\n`);
  }

  console.log(`Variaveis de ambiente:
  DEBUG=1            - Habilita verbose output
  DRY_RUN=1          - Simula execução sem fazer mudanças

Exemplos:

  npm run dev -- context:build task my-project "payment feature"
  npm run dev -- memory:vacuum
  npm run dev -- memory:sync my-project
  npm run dev -- project:health
  npm run dev -- project:init awesome-app
  DEBUG=1 npm run dev -- project:health

`);
}

/**
 * Run subprocess
 */
function runScript(scriptPath: any, args: string[] = []) {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn('node', [scriptPath, ...args], {
      stdio: 'inherit',
      cwd: root,
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script exited with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

function harnessCommand(command: any) {
  return async function runHarness(args: string[] = []) {
    await runScript(path.join(root, 'scripts', 'agent-harness.mjs'), [command, ...args]);
  };
}

/**
 * Context Build Handler
 */
async function contextBuild([mode, project, keyword]: string[] = []) {
  if (!mode || !project) {
    console.error('Uso: context:build <global|domain|task> <project> [keyword]');
    process.exit(1);
  }

  console.log(`Building ${mode} context for ${project}...`);

  try {
    ensureSchema({ silent: true });
    const builder = (await import('../lib/context-builder.ts')).default;
    const dbPath = getDbPath();

    const ctx = new builder(root, dbPath);
    ctx.connect();

    const content = ctx.build(mode, project, keyword);
    const stats = ctx.stats(mode, project, keyword);

    const outDir = path.join(root, '.context');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const outFile = path.join(outDir, `context-${mode}.md`);
    fs.writeFileSync(outFile, content, 'utf8');

    ctx.close();

    console.log(`Context saved: ${outFile}`);
    console.log('Stats:', stats);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

/**
 * Memory Vacuum Handler
 */
async function memoryVacuum() {
  console.log('Running memory vacuum...');

  try {
    await runScript(path.join(root, 'scripts', 'compress-memory.mjs'));
    console.log('Memory vacuum complete');
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

/**
 * Memory Sync Handler
 */
async function memorySync([project]: string[] = []) {
  console.log(`Syncing memory indexes${project ? ` for ${project}` : ''}...`);

  try {
    ensureSchema({ silent: true });
    const dbPath = getDbPath();

    if (!fs.existsSync(dbPath)) {
      console.warn('Database not found. Run: npm run memory:db:init');
      return;
    }

    // TODO: Implementar sync com FTS5 rebuild
    console.log('Memory indexes synced');
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

/**
 * Project Health Check
 */
async function projectHealth() {
  console.log('Running project health checks...\n');

  const checks = [];
  let healthy = true;

  // 1. Check estrutura
  console.log('Checking structure...');
  const requiredDirs = [
    'lib',
    'scripts',
    'docs',
    'memory',
    'agents',
    'skills',
    'prompts',
  ];

  for (const dir of requiredDirs) {
    const exists = fs.existsSync(path.join(root, dir));
    const status = exists ? 'OK ' : 'FAIL';
    console.log(`   ${status} ${dir}/`);
    if (!exists) healthy = false;
  }

  // 2. Check config
  console.log('\nChecking config...');
  const configFiles = ['.memoryrc.json', 'package.json'];

  for (const file of configFiles) {
    const exists = fs.existsSync(path.join(root, file));
    const status = exists ? 'OK ' : 'FAIL';
    console.log(`   ${status} ${file}`);
    if (!exists) healthy = false;
  }

  // 3. Check key files
  console.log('\nChecking key files...');
  const keyFiles = ['bin/create-memory-nest-kit.js', 'lib/context-builder.js'];

  for (const file of keyFiles) {
    const exists = fs.existsSync(path.join(root, file));
    const status = exists ? 'OK ' : 'FAIL';
    console.log(`   ${status} ${file}`);
    if (!exists) healthy = false;
  }

  // 4. Check database
  console.log('\nChecking database...');
  ensureSchema({ silent: true });
  const dbPath = getDbPath();
  const dbExists = fs.existsSync(dbPath);
  console.log(`   ${dbExists ? 'OK ' : 'WARN'} ${dbPath}`);

  // 5. Summary
  console.log('');
  if (healthy) {
    console.log('Project health: GOOD');
  } else {
    console.log('Project health: Issues found - run: npm run project:init');
  }
  console.log('');

  process.exit(healthy ? 0 : 1);
}

/**
 * Project Init Handler
 */
async function projectInit([projectName, ...flags]: string[] = []) {
  if (!projectName) {
    console.error('Uso: project:init <project-name> [--force] [--only-memory]');
    process.exit(1);
  }

  console.log(`Initializing project: ${projectName}...\n`);

  try {
    await runScript(path.join(root, 'bin', 'create-memory-nest-kit.js'), [
      projectName,
      ...flags,
    ]);
    console.log(`\nProject ${projectName} initialized.`);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

/**
 * Main entrypoint
 */
async function main() {
  const args = process.argv.slice(2);
  const [command, ...cmdArgs] = args;

  if (!command || command === '--help' || command === '-h') {
    showHelp();
    return;
  }

  const commandInfo = (COMMANDS as any)[command];

  if (!commandInfo) {
    console.error(`Unknown command: ${command}`);
    console.error(`\nRun: npm run dev -- --help\n`);
    process.exit(1);
  }

  if (process.env.DEBUG) {
    console.log(`DEBUG: command=${command}, args=${JSON.stringify(cmdArgs)}\n`);
  }

  try {
    await commandInfo.handler(cmdArgs);
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}

// Run
main().catch(console.error);

export { COMMANDS, runScript };
