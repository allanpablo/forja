#!/usr/bin/env node
/**
 * bin/init-project.ts — gerador de projeto do workspace, chamado por `forja project:new`.
 *
 * Gera memória + agentes (create-memory-nest-kit), backend NestJS opcional, design-md, e conecta o
 * projeto à inteligência do Forja (lib/project-wiring.ts). Termina com exit 1 se algo essencial
 * falhou — o resumo final lista cada pendência.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { wireProject, checkProjectWiring } from '../lib/project-wiring.ts';
import { COMMANDS } from '../lib/core/registry.ts';
import { resolveTemplate, applyTemplate, type TemplateInfo } from '../lib/templates.ts';
import {
  getWorkspaceRoot,
  getProjectsDir,
  resolveProject,
  initWorkspace,
  getWorkspaceProjectsMemoryDir,
  assertOutsideFrameworkRepo,
} from '../lib/workspace.ts';
import { pkgRoot, script } from '../lib/paths.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// kitRoot = assets do pacote (design-md, templates, instruções); o gerador é código → script().
const kitRoot = pkgRoot;
const memoryKit = script('bin/create-memory-nest-kit');

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const DEFAULT_AI_AGENTS = ['copilot', 'claude', 'gemini', 'codex'];
// IAs suportadas e a conexão de cada uma: lib/project-wiring.ts (ADR-0086).

const SETUP_CHECKLIST = [
  '00-git-init',
  '01-generate-structure',
  '01t-apply-template',
  '01b-copy-design-library',
  '02-wire-intelligence',
  '03-install-backend',
  '04-init-memory-db',
  '05-build-context-pack',
  '06-universal-memory-sync',
  '07-show-next-steps',
];

// ============================================================================
// HELPERS
// ============================================================================

// Pendências do setup: `warn` aparece no resumo final; `fail` faz o processo sair com 1. Antes, todo
// problema virava um log e o setup terminava com "Tudo pronto!" e exit 0 mesmo sem instruções de IA.
const ISSUES: { level: 'warn' | 'fail'; msg: string }[] = [];
function issue(level: 'warn' | 'fail', msg: string) {
  ISSUES.push({ level, msg });
  log(msg, level === 'fail' ? 'error' : 'warn');
}

function log(msg: any, level = 'info') {
  const prefix = {
    info: '📌',
    success: '✅',
    warn: '⚠️',
    error: '❌',
    step: '🔄',
    done: '✨',
  }[level] || '→';
  console.log(`${prefix} ${msg}`);
}

function logSection(title: any) {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(80)}\n`);
}

function execCmd(cmd: any, opts: { quiet?: boolean; ignoreError?: boolean } = {}) {
  try {
    return execSync(cmd, { 
      stdio: opts.quiet ? 'pipe' : 'inherit',
      ...opts 
    });
  } catch (err) {
    if (!opts.ignoreError) {
      log(`Comando falhou: ${cmd}`, 'error');
      throw err;
    }
  }
}

function ensureDir(dir: any) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyDir(src: any, dest: any) {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ============================================================================
// PARSEARGS
// ============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    skipBackend: args.includes('--skip-backend'),
    skipDb: args.includes('--skip-db'),
    skipGit: args.includes('--skip-git'),
    skipDesign: args.includes('--skip-design'),
    ai: DEFAULT_AI_AGENTS,
    verbose: args.includes('--verbose'),
    template: null as TemplateInfo | null,
  };

  // --template <boilerplate>: resolvido antes de criar qualquer arquivo — template inexistente ou
  // não validado falha aqui, sem deixar um projeto pela metade.
  const tplIdx = args.indexOf('--template');
  if (tplIdx >= 0) {
    const name = args[tplIdx + 1];
    if (!name || name.startsWith('--')) { console.error('--template exige um nome (veja: forja project:templates)'); process.exit(1); }
    try { opts.template = resolveTemplate(name); } catch (e) { console.error(`❌ ${(e as Error).message}`); process.exit(1); }
  }

  // Parse --ai flag
  const aiIdx = args.findIndex(a => a === '--ai');
  if (aiIdx >= 0 && aiIdx + 1 < args.length) {
    opts.ai = args[aiIdx + 1].split(',').map(s => s.trim());
  }

  // Project name (primeiro arg que não é flag nem valor de flag)
  const flagValues = new Set(['--ai', '--template'].filter((f) => args.includes(f)).map((f) => args[args.indexOf(f) + 1]));
  const projectName = args.find(a => !a.startsWith('--') && !flagValues.has(a));

  // Projetos de produto vivem obrigatoriamente no workspace externo.
  // init-project nao aceita mais path customizado para evitar poluicao do repo do framework.
  const projectDir = projectName ? resolveProject(projectName) : null;

  return { projectName, projectPath: projectDir, opts };
}

// ============================================================================
// SETUP STEPS
// ============================================================================

async function step00GitInit(projectDir: any, opts: any) {
  if (opts.skipGit) return;

  log('Preparando diretório...', 'step');

  ensureDir(projectDir);

  // Se for um sub-projeto dentro do repo principal, talvez não queira git init
  // Mas se for independente, git init faz sentido.
  // Como o usuário quer ignorar a pasta projects/, podemos opcionalmente dar git init.
  
  if (!fs.existsSync(path.join(projectDir, '.git'))) {
    try {
      execCmd(`cd "${projectDir}" && git init`, { quiet: true });
      
      // Criar .gitignore se não existir
      const gitignore = path.join(projectDir, '.gitignore');
      if (!fs.existsSync(gitignore)) {
        fs.writeFileSync(gitignore, `node_modules/\n.env\n.env.local\ndist/\n.DS_Store\n.context/\n.memory/\n`);
      }
      
      log('Git repository inicializado no projeto', 'success');
    } catch (e) {
      log('Aviso: falha ao rodar git init (talvez diretório já em repo git)', 'warn');
    }
  }
}

async function step01GenerateStructure(projectDir: any, opts: any) {
  log('Gerando estrutura de agentes e memória...', 'step');

  // Verifica se já existe código (ex: backend) para decidir se usa --only-memory
  const hasBackend = fs.existsSync(path.join(projectDir, 'backend')) || fs.existsSync(path.join(projectDir, 'package.json'));
  // Com template, o backend vem do boilerplate: o gerador entrega só memória e agentes.
  const onlyMemory = hasBackend || opts.template ? '--only-memory' : '';

  const cmd = opts.skipBackend 
    ? `node "${memoryKit}" "${projectDir}" --only-memory --force`
    : `node "${memoryKit}" "${projectDir}" ${onlyMemory} --force`;

  try {
    execCmd(cmd);
    log('Estrutura gerada com sucesso', 'success');
    
    // Adicionar camadas extras de escalonamento e growth
    addScalingLayers(projectDir);
  } catch (err) {
    log('Erro ao gerar estrutura', 'error');
    throw err;
  }
}

function addScalingLayers(projectDir: any) {
  const memoryDir = path.join(projectDir, 'memory');
  
  const layers = {
    '10-product/growth/vision.md': '# Estratégia de Growth\n\nDescreva como o produto irá crescer e atrair novos usuários.',
    '10-product/scaling/strategy.md': '# Estratégia de Escalonamento de Produto\n\nDescreva como o produto irá suportar o aumento de carga e usuários.',
    '20-architecture/scaling-patterns.md': '# Padrões de Escalonamento Arquitetural\n\n- Cache\n- Filas\n- Microsserviços\n- Otimização de Queries',
  };

  for (const [rel, content] of Object.entries(layers)) {
    const abs = path.join(memoryDir, rel);
    ensureDir(path.dirname(abs));
    if (!fs.existsSync(abs)) {
      fs.writeFileSync(abs, content, 'utf8');
    }
  }
  log('Camadas de Growth e Scaling adicionadas', 'success');
}

async function step01tApplyTemplate(projectDir: any, opts: any) {
  if (!opts.template) return;
  log(`Aplicando o template ${opts.template.name}...`, 'step');
  try {
    const copied = applyTemplate(projectDir, opts.template);
    log(`${copied.length} arquivo(s) do template aplicados (código e memória do boilerplate prevalecem)`, 'success');
  } catch (err) {
    issue('fail', `Falha ao aplicar o template ${opts.template.name}: ${err.message}`);
  }
}

async function step01bCopyDesignLibrary(projectDir: any, opts: any) {
  if (opts.skipDesign) {
    log('Skipping design library copy (--skip-design)', 'warn');
    return;
  }

  const srcDesignDir = path.join(kitRoot, 'design-md');
  const destDesignDir = path.join(projectDir, 'design-md');

  if (!fs.existsSync(srcDesignDir)) {
    issue('fail', `Biblioteca de design não encontrada em ${srcDesignDir}`);
    return;
  }

  log('Copiando biblioteca de referências de design (design-md)...', 'step');

  try {
    copyDir(srcDesignDir, destDesignDir);
    log('Biblioteca design-md copiada para o projeto', 'success');
  } catch (err) {
    issue('fail', `Erro ao copiar biblioteca de design: ${err.message}`);
  }
}

// Liga o projeto à inteligência do Forja (ADR-0086): AGENTS.md/CLAUDE.md/GEMINI.md nativos, hooks,
// sub-agents, MCP e scripts que chamam o `forja`. A mesma função serve ao `project:wire` e ao
// `project:upgrade`; a verificação em seguida é a mesma do `project:wire --check`.
async function step02WireIntelligence(projectDir: any, opts: any) {
  log('Conectando o projeto à inteligência do Forja...', 'step');
  const changes = wireProject(projectDir, { ai: opts.ai });
  log(`${changes.filter((c) => c.action !== 'unchanged').length} arquivo(s) de conexão escritos (IAs: ${opts.ai.join(', ')})`, 'success');
  for (const c of checkProjectWiring(projectDir, { commands: COMMANDS, ai: opts.ai })) {
    if (c.status === 'fail') issue('fail', `conexão ${c.id}: ${c.detail}`);
    else if (c.status === 'warn') issue('warn', `conexão ${c.id}: ${c.detail}`);
  }
}

async function step03InstallBackend(projectDir: any, opts: any) {
  if (opts.skipBackend) {
    log('Skipping backend install (--skip-backend)', 'warn');
    return;
  }

  const backendDir = path.join(projectDir, 'backend');
  if (!fs.existsSync(backendDir)) {
    log('Backend directory não encontrado', 'warn');
    return;
  }

  log('Instalando dependências do backend...', 'step');

  try {
    execCmd(`cd "${backendDir}" && npm install --quiet`, { quiet: true });
    log('npm install concluído', 'success');
  } catch (err) {
    // Não derruba o setup (rede/registry podem estar fora), mas aparece no resumo.
    issue('warn', `npm install do backend falhou — rode depois: cd backend && npm install${opts.verbose ? '' : ' (detalhes: --verbose)'}`);
  }
}

// O projeto nasce indexado: `forja status` diz "memória indexada: sim" e `context:smart` já responde.
async function step04InitMemoryDb(projectDir: any, opts: any) {
  if (opts.skipDb) {
    log('Indexação da memória pulada (--skip-db)', 'warn');
    return;
  }
  log('Indexando a memória do projeto (forja sync:universal)...', 'step');
  const env: NodeJS.ProcessEnv = { ...process.env, FORJA_MODE: 'embedded' };
  delete env.FORJA_WORKSPACE;
  try {
    execSync(`node "${script('scripts/sync-universal-memory')}"`, { cwd: projectDir, env, stdio: opts.verbose ? 'inherit' : 'pipe' });
    log('Memória indexada em memory/sqlite/universal.db', 'success');
  } catch (err) {
    issue('warn', `Indexação da memória falhou — rode depois: forja sync:universal (${String(err.message).split('\n')[0]})`);
  }
}

async function step05BuildContextPack(projectDir: any, opts: any) {
  const scriptsDir = path.join(projectDir, 'scripts');
  const scriptPath = path.join(scriptsDir, 'build-context-pack.mjs');

  if (!fs.existsSync(scriptPath)) {
    log('Script context-pack não encontrado', 'warn');
    return;
  }

  log('Construindo context pack...', 'step');

  try {
    execCmd(`cd "${projectDir}" && node scripts/build-context-pack.mjs 2>/dev/null`, { quiet: true, ignoreError: true });
    log('Context pack criado em .context/context-pack.md', 'success');
  } catch (err) {
    log('Erro ao criar context pack', 'warn');
  }
}

async function step06UniversalMemorySync(projectDir: any, opts: any) {
  log('Sincronizando com Memória Universal...', 'step');

  const projectName = path.basename(projectDir);
  const rootMemoryDir = getWorkspaceProjectsMemoryDir();
  ensureDir(rootMemoryDir);

  const projectInfoFile = path.join(rootMemoryDir, `${projectName}.md`);
  const content = `# Projeto: ${projectName}\n\n- **Status**: Ativo\n- **Diretório**: ${projectDir}\n- **Workspace**: ${getWorkspaceRoot()}\n- **Criado em**: ${new Date().toISOString()}\n\n## Descrição\n(Descreva o projeto aqui)\n`;

  if (!fs.existsSync(projectInfoFile)) {
    fs.writeFileSync(projectInfoFile, content, 'utf8');
  }

  log(`Projeto ${projectName} registrado na Memória Universal do workspace`, 'success');
}

async function step07ShowNextSteps(projectDir: any, opts: any) {
  const relPath = path.relative(process.cwd(), projectDir) || '.';
  const fails = ISSUES.filter((i) => i.level === 'fail');
  const warns = ISSUES.filter((i) => i.level === 'warn');

  logSection(fails.length ? '❌ SETUP INCOMPLETO' : warns.length ? '⚠️  SETUP CONCLUÍDO COM PENDÊNCIAS' : '✨ SETUP COMPLETO!');
  console.log(`📁 Projeto: ${relPath}\n`);

  if (ISSUES.length) {
    console.log('Pendências:');
    for (const i of ISSUES) console.log(`  ${i.level === 'fail' ? '✗' : '!'} ${i.msg}`);
    console.log('');
  }

  console.log('Próximos passos:\n');
  console.log(`  cd ${relPath}`);
  console.log('  forja status                  # estado do projeto');
  console.log('  forja project:wire --check    # IA, hooks e MCP conectados');
  console.log('  forja spec:new <feature>      # primeira feature');
  if (!opts.skipBackend) console.log('  cd backend && npm run start:dev');
  console.log('');
  console.log(`IAs conectadas: ${opts.ai.join(', ')} — instruções em AGENTS.md${opts.ai.includes('claude') ? ' e CLAUDE.md' : ''}.`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const { projectName, projectPath, opts } = parseArgs();

  if (!projectName) {
    console.log(`
Uso: forja project:new <nome> [-- opções]

Cria um projeto no workspace Forja (padrão: ~/forja-workspace/projects) já conectado à IA.

Opções:
  --ai <lista>          IAs a conectar (padrão: copilot,claude,gemini,codex)
  --template <nome>     Parte de um boilerplate validado (veja: forja project:templates)
  --skip-backend        Não gera nem instala o backend NestJS
  --skip-db             Não indexa a memória do projeto
  --skip-git            Não inicializa o Git
  --skip-design         Não copia a biblioteca design-md
  --verbose             Saída detalhada

Workspace: FORJA_WORKSPACE → workspaceRoot em ~/.forjarc.json → ~/forja-workspace

Exemplos:
  forja project:new meu-app
  forja project:new meu-app -- --ai claude,codex --skip-backend
  forja project:new pedidos -- --template clean-arch
    `);
    process.exit(projectName === undefined && process.argv.length > 2 ? 1 : 0);
  }

  const target = projectName;

  // Garante workspace pronto
  initWorkspace();

  const projectDir = projectPath || resolveProject(target);
  assertOutsideFrameworkRepo(projectDir, 'init-project');

  logSection('🚀 Inicializando Novo Projeto com Agentes Orquestrados');
  log(`Workspace ativo: ${getWorkspaceRoot()}`, 'info');
  log(`Projeto: ${projectDir}`, 'info');

  try {
    // Executar checklist de setup
    for (const step of SETUP_CHECKLIST) {
      if (step === '00-git-init') await step00GitInit(projectDir, opts);
      else if (step === '01-generate-structure') await step01GenerateStructure(projectDir, opts);
      else if (step === '01t-apply-template') await step01tApplyTemplate(projectDir, opts);
      else if (step === '01b-copy-design-library') await step01bCopyDesignLibrary(projectDir, opts);
      else if (step === '02-wire-intelligence') await step02WireIntelligence(projectDir, opts);
      else if (step === '03-install-backend') await step03InstallBackend(projectDir, opts);
      else if (step === '04-init-memory-db') await step04InitMemoryDb(projectDir, opts);
      else if (step === '05-build-context-pack') await step05BuildContextPack(projectDir, opts);
      else if (step === '06-universal-memory-sync') await step06UniversalMemorySync(projectDir, opts);
      else if (step === '07-show-next-steps') await step07ShowNextSteps(projectDir, opts);
    }

    const failed = ISSUES.some((i) => i.level === 'fail');
    log(failed ? 'Init terminou com falhas.' : 'Init completo!', failed ? 'error' : 'done');
    process.exit(failed ? 1 : 0);
  } catch (err) {
    console.error('\n❌ Erro durante setup:', err.message);
    process.exit(1);
  }
}

main();
