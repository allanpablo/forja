#!/usr/bin/env node
/**
 * init-project.js
 * 
 * Comando universal para inicializar novo projeto com agentes orquestrados.
 * Puxa configuração de Copilot, Claude, Gemini, Codex e outros.
 * 
 * Uso:
 *   node bin/init-project.js meu-projeto
 *   node bin/init-project.js meu-projeto --ai copilot,claude,gemini
 *   node bin/init-project.js meu-projeto --skip-backend
 *   node bin/init-project.js --interactive
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  getWorkspaceRoot,
  getProjectsDir,
  resolveProject,
  initWorkspace,
  getWorkspaceProjectsMemoryDir,
  assertOutsideFrameworkRepo,
} from '../lib/workspace.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const kitRoot = path.resolve(__dirname, '..');

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const DEFAULT_AI_AGENTS = ['copilot', 'claude', 'gemini', 'codex'];
// Conteúdo canônico único (ADR-0020): toda IA recebe a mesma explicação da
// estrutura Forja; só o cabeçalho muda. CLAUDE.md do framework NÃO é copiado —
// ele descreve o repo do motor, não o projeto gerado.
const CANONICAL_INSTRUCTIONS = '.gemini-instructions.md';
const AI_LABELS = {
  copilot: 'GitHub Copilot',
  claude: 'Claude',
  gemini: 'Gemini',
  codex: 'OpenAI Codex',
};

const SETUP_CHECKLIST = [
  '00-git-init',
  '01-generate-structure',
  '01b-copy-design-library',
  '01c-emit-harness',
  '02-copy-instructions',
  '03-install-backend',
  '04-init-memory-db',
  '05-build-context-pack',
  '06-universal-memory-sync',
  '07-show-next-steps',
];

// ============================================================================
// HELPERS
// ============================================================================

function log(msg, level = 'info') {
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

function logSection(title) {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(80)}\n`);
}

function execCmd(cmd, opts: { quiet?: boolean; ignoreError?: boolean } = {}) {
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

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyFile(src, dest) {
  const content = fs.readFileSync(src, 'utf-8');
  fs.writeFileSync(dest, content, 'utf-8');
}

function copyFileIfExists(src, dest) {
  if (fs.existsSync(src)) {
    copyFile(src, dest);
    return true;
  }
  return false;
}

function copyDir(src, dest) {
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
    interactive: args.includes('--interactive'),
    skipBackend: args.includes('--skip-backend'),
    skipDb: args.includes('--skip-db'),
    skipGit: args.includes('--skip-git'),
    skipDesign: args.includes('--skip-design'),
    ai: DEFAULT_AI_AGENTS,
    verbose: args.includes('--verbose'),
  };

  // Parse --ai flag
  const aiIdx = args.findIndex(a => a === '--ai');
  if (aiIdx >= 0 && aiIdx + 1 < args.length) {
    opts.ai = args[aiIdx + 1].split(',').map(s => s.trim());
  }

  // Project name (primeiro arg sem --)
  const projectName = args.find(a => !a.startsWith('--'));

  // Projetos de produto vivem obrigatoriamente no workspace externo.
  // init-project nao aceita mais path customizado para evitar poluicao do repo do framework.
  const projectDir = projectName ? resolveProject(projectName) : null;

  return { projectName, projectPath: projectDir, opts };
}

// ============================================================================
// SETUP STEPS
// ============================================================================

async function step00GitInit(projectDir, opts) {
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

async function step01GenerateStructure(projectDir, opts) {
  log('Gerando estrutura de agentes e memória...', 'step');

  // Verifica se já existe código (ex: backend) para decidir se usa --only-memory
  const hasBackend = fs.existsSync(path.join(projectDir, 'backend')) || fs.existsSync(path.join(projectDir, 'package.json'));
  const onlyMemory = hasBackend ? '--only-memory' : '';

  const cmd = opts.skipBackend 
    ? `node "${path.join(kitRoot, 'bin/create-memory-nest-kit.js')}" "${projectDir}" --only-memory --force`
    : `node "${path.join(kitRoot, 'bin/create-memory-nest-kit.js')}" "${projectDir}" ${onlyMemory} --force`;

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

function addScalingLayers(projectDir) {
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

async function step01bCopyDesignLibrary(projectDir, opts) {
  if (opts.skipDesign) {
    log('Skipping design library copy (--skip-design)', 'warn');
    return;
  }

  const srcDesignDir = path.join(kitRoot, 'design-md');
  const destDesignDir = path.join(projectDir, 'design-md');

  if (!fs.existsSync(srcDesignDir)) {
    log('Biblioteca de design não encontrada no kit root', 'warn');
    return;
  }

  log('Copiando biblioteca de referências de design (design-md)...', 'step');

  try {
    copyDir(srcDesignDir, destDesignDir);
    log('Biblioteca design-md copiada para o projeto', 'success');
  } catch (err) {
    log('Erro ao copiar biblioteca de design', 'error');
    if (opts.verbose) console.error(err);
  }
}

// Camada de code intelligence + ferramentas de processo (ADR-0017, ADR-0018).
// Cada projeto gerado herda codegraph (MCP) + scripts code:* + tools:doctor,
// de forma auto-contida (so dependem do binario codegraph, opcional).
const HARNESS_SCRIPTS = {
  'code:index': 'codegraph init',
  'code:sync': 'codegraph sync',
  'code:status': 'codegraph status',
  'code:query': 'codegraph query',
  'code:check': 'node scripts/code-intel.mjs check',
  'code:impact': 'node scripts/code-intel.mjs impact',
  'tools:doctor': 'node scripts/tools-doctor.mjs',
};

async function step01cEmitHarness(projectDir, opts) {
  log('Emitindo harness de code intelligence (codegraph + tools)...', 'step');

  // 1. .mcp.json (codegraph) — aditivo, nao sobrescreve config existente
  const mcpDest = path.join(projectDir, '.mcp.json');
  const mcpSrc = path.join(kitRoot, 'lib/templates/harness/mcp.json');
  if (!fs.existsSync(mcpDest)) {
    copyFileIfExists(mcpSrc, mcpDest);
  }

  // 2. scripts auto-contidos
  const scriptsDir = path.join(projectDir, 'scripts');
  ensureDir(scriptsDir);
  copyFileIfExists(
    path.join(kitRoot, 'lib/templates/harness/code-intel.mjs'),
    path.join(scriptsDir, 'code-intel.mjs'),
  );
  copyFileIfExists(
    path.join(kitRoot, 'scripts/tools-doctor.mjs'),
    path.join(scriptsDir, 'tools-doctor.mjs'),
  );

  // 3. merge dos scripts no package.json (cria minimo se ausente)
  const pkgPath = path.join(projectDir, 'package.json');
  let pkg;
  if (fs.existsSync(pkgPath)) {
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    } catch {
      log('package.json ilegivel; harness scripts nao injetados', 'warn');
      return;
    }
  } else {
    pkg = { name: path.basename(projectDir), version: '0.1.0', type: 'module', scripts: {} };
  }
  pkg.scripts = pkg.scripts || {};
  for (const [key, value] of Object.entries(HARNESS_SCRIPTS)) {
    if (!pkg.scripts[key]) pkg.scripts[key] = value;
  }
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

  log('Harness emitido: .mcp.json + code:* + tools:doctor', 'success');
}

async function step02CopyInstructions(projectDir, opts) {
  log('Copiando instruções para IAs...', 'step');

  const instructionsDir = path.join(projectDir, '.ia-instructions');
  ensureDir(instructionsDir);

  const canonicalPath = path.join(kitRoot, CANONICAL_INSTRUCTIONS);
  let canonical: string | null = null;
  if (fs.existsSync(canonicalPath)) {
    canonical = fs.readFileSync(canonicalPath, 'utf8');
  }

  let copied = 0;
  for (const ai of opts.ai) {
    const label = AI_LABELS[ai];
    if (!label || !canonical) {
      log(`${ai.toUpperCase()}: não encontrado`, 'warn');
      continue;
    }

    const others = Object.entries(AI_LABELS)
      .filter(([key]) => key !== ai)
      .map(([, name]) => name);
    const content = canonical
      .replace(/^# Instruções para .+ — Forja$/m, `# Instruções para ${label} — Forja`)
      .replace(
        /^> Guia para .+ multi-IA por design\.$/m,
        `> Guia para ${label} operar a Forja. O conteúdo é o mesmo para ${others.slice(0, -1).join(', ')} e ${others.at(-1)} — a Forja é multi-IA por design.`
      );

    fs.writeFileSync(path.join(instructionsDir, `${ai}.md`), content, 'utf8');
    log(`${ai.toUpperCase()}: ✓`, 'success');
    copied++;
  }

  // Criar INDEX
  const indexContent = `# IA Assistants Configuration

Este diretório contém instruções específicas para cada IA assistant.

## Gestão de Cotas & Alternância
Para trocar de IA (ex: se acabar a cota), use o arquivo [models.json](./models.json) para identificar o próximo motor na fila de fallback.

## IAs Configuradas

${opts.ai.map(ai => `- [${ai.toUpperCase()}](./${ai}.md)`).join('\n')}
`;

  fs.writeFileSync(path.join(instructionsDir, 'README.md'), indexContent);

  // Criar models.json para interoperabilidade
  const modelsJson = {
    active_engine: opts.ai[0] || 'copilot',
    fallback_chain: opts.ai,
    engines: opts.ai.reduce((acc, ai) => {
      acc[ai] = {
        name: ai.toUpperCase(),
        instruction_file: `.ia-instructions/${ai}.md`,
        status: "ready"
      };
      return acc;
    }, {})
  };
  fs.writeFileSync(path.join(instructionsDir, 'models.json'), JSON.stringify(modelsJson, null, 2));

  log(`${copied} instruções copiadas para .ia-instructions/`, 'success');
}

async function step03InstallBackend(projectDir, opts) {
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
    log('Erro ao rodar npm install', 'error');
    if (!opts.verbose) {
      log('Use --verbose para mais detalhes', 'warn');
    }
    // Não falha o setup inteiro
  }
}

async function step04InitMemoryDb(projectDir, opts) {
  if (opts.skipDb || opts.skipBackend) {
    log('Skipping DB init', 'warn');
    return;
  }

  const backendDir = path.join(projectDir, 'backend');
  const scriptPath = path.join(backendDir, 'scripts/memory-db-init.mjs');

  if (!fs.existsSync(scriptPath)) {
    log('Script de init DB não encontrado', 'warn');
    return;
  }

  log('Inicializando banco de dados SQLite...', 'step');

  try {
    execCmd(`cd "${backendDir}" && npm run memory:db:init 2>/dev/null`, { quiet: true, ignoreError: true });
    log('SQLite inicializado em .memory/sqlite/context.db', 'success');
  } catch (err) {
    log('Erro ao inicializar DB', 'warn');
  }
}

async function step05BuildContextPack(projectDir, opts) {
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

async function step06UniversalMemorySync(projectDir, opts) {
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

async function step07ShowNextSteps(projectDir, opts) {
  const relPath = path.relative(process.cwd(), projectDir) || '.';

  logSection('✨ SETUP COMPLETO!');

  console.log(`📁 Projeto criado em: ${relPath}\n`);

  console.log('📚 Próximos Passos:\n');

  console.log(`  1. Entrar no projeto:`);
  console.log(`     cd ${relPath}\n`);

  console.log(`  2. Ver estrutura de memória:`);
  console.log(`     ls -la memory/\n`);

  console.log(`  3. Carregar instruções para IA:`);
  console.log(`     cat .ia-instructions/copilot.md`);
  console.log(`     cat .ia-instructions/claude.md\n`);

  if (!opts.skipBackend) {
    console.log(`  4. Iniciar backend em dev mode:`);
    console.log(`     cd backend && npm run start:dev\n`);

    console.log(`  5. Rodar testes:`);
    console.log(`     cd backend && npm test\n`);
  }

  console.log(`  6. Atualizar documentação em memory/\n`);

  console.log(`  7. Sincronizar contexto com BD:`);
  console.log(`     cd backend && npm run memory:db:sync\n`);

  console.log(`  8. Limpar memória antiga (Vacuum):`);
  console.log(`     node scripts/memory-vacuum.mjs\n`);

  console.log(`  9. Consultar contexto:`);
  console.log(`     cd backend && npm run memory:db:query -- "search" "auth" 10\n`);

  console.log('📖 Recursos:');
  console.log(`  • Documentação: cat memory/README.md`);
  console.log(`  • Agentes: cat AGENTS.md`);
  console.log(`  • Decisões: cat memory/90-decisions/ADR-*.md\n`);

  console.log('🤖 Instruções para IAs:');
  for (const ai of opts.ai) {
    const aiFile = path.join(relPath, `.ia-instructions/${ai}.md`);
    console.log(`  • ${ai.toUpperCase()}: .ia-instructions/${ai}.md`);
  }

  console.log('\n🚀 Tudo pronto! Comece a codificar!\n');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const { projectName, projectPath, opts } = parseArgs();

  if (!projectName && !opts.interactive) {
    console.log(`
init-project v0.6.0 (Workspace separado)

Cria projetos de produto no workspace Forja (padrão: ~/forja-workspace/projects).
O repositório do framework permanece isolado.

Uso: node bin/init-project.js <project-name> [opções]

Opções:
  --ai <list>           IAs para configurar (padrão: copilot,claude,gemini,codex)
  --skip-backend        Pula instalação do backend NestJS
  --skip-db             Pula inicialização do SQLite
  --skip-git            Pula inicialização do Git
  --skip-design         Pula cópia da biblioteca design-md
  --interactive         Modo interativo
  --verbose             Output detalhado

Workspace:
  O caminho é resolvido por prioridade:
    1. Variável de ambiente FORJA_WORKSPACE
    2. Campo workspaceRoot em ~/.forjarc.json
    3. Padrão: ~/forja-workspace

Exemplos:
  node bin/init-project.js meu-projeto
  node bin/init-project.js meu-projeto --ai copilot,claude
  node bin/init-project.js meu-projeto --skip-backend
  node bin/init-project.js --interactive
    `);
    process.exit(0);
  }

  let target = projectName;

  // Interactive mode
  if (opts.interactive || !projectName) {
    logSection('🎯 Modo Interativo');

    // Simular input (em produção, usar package como prompt ou readline)
    target = projectName || 'meu-projeto';
    log(`Projeto: ${target}`, 'info');
    log(`IAs: ${opts.ai.join(', ')}`, 'info');
  }

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
      else if (step === '01b-copy-design-library') await step01bCopyDesignLibrary(projectDir, opts);
      else if (step === '01c-emit-harness') await step01cEmitHarness(projectDir, opts);
      else if (step === '02-copy-instructions') await step02CopyInstructions(projectDir, opts);
      else if (step === '03-install-backend') await step03InstallBackend(projectDir, opts);
      else if (step === '04-init-memory-db') await step04InitMemoryDb(projectDir, opts);
      else if (step === '05-build-context-pack') await step05BuildContextPack(projectDir, opts);
      else if (step === '06-universal-memory-sync') await step06UniversalMemorySync(projectDir, opts);
      else if (step === '07-show-next-steps') await step07ShowNextSteps(projectDir, opts);
    }

    log('Init completo!', 'done');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Erro durante setup:', err.message);
    process.exit(1);
  }
}

main();
