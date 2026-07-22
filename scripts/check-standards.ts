import fs from 'node:fs';
import path from 'node:path';
import { resolveProject, getWorkspaceInfo, initWorkspace } from '../lib/workspace.ts';

// O projeto a auditar é ONDE O USUÁRIO INVOCOU — `process.cwd()`, propagado pelo dispatcher desde a
// v1.6.2. Cravar `__dirname/..` auditava a raiz do PACOTE (`node_modules/forjajs/dist`) no consumidor
// e reportava tudo como faltando (bug da v1.7.0, mesma classe do spec-cli). No repo do framework,
// invoca-se da raiz, então cwd = a raiz do framework — comportamento inalterado.
const root = process.cwd();

const [projectArg] = process.argv.slice(2);

const project = projectArg || 'framework-root';
let projectDir: any;
if (projectArg) {
  initWorkspace();
  projectDir = resolveProject(projectArg);
} else {
  projectDir = root;
}

const PROJECT_MANDATORY_FILES = [
  'memory/00-global/mission.md',
  'memory/10-product/vision.md',
  'memory/20-architecture/scaling-patterns.md', // Criado pelo nosso init
  'AGENTS.md',
  '.memoryrc.json'
];

const ROOT_MANDATORY_FILES = [
  'AGENTS.md',
  'README.md',
  'package.json',
  'memory/00-global/mission.md',
  'memory/40-delivery/backlog.md',
  'memory/50-orchestration/gsd-harness.md',
  'specs/README.md',
];

function check() {
  if (!fs.existsSync(projectDir)) {
    console.error(`Projeto nao encontrado: ${projectArg}`);
    if (projectArg) {
      const info = getWorkspaceInfo();
      console.error(`Workspace ativo: ${info.root} (${info.source})`);
      console.error(`Diretorio esperado: ${resolveProject(projectArg)}`);
    }
    process.exit(1);
  }

  const mandatoryFiles = projectArg ? PROJECT_MANDATORY_FILES : ROOT_MANDATORY_FILES;

  console.log(`\nAnalisando aderencia aos padroes: ${project.toUpperCase()}...\n`);
  if (projectArg) {
    const info = getWorkspaceInfo();
    console.log(`Workspace: ${info.root} (${info.source})`);
    console.log(`Projeto:  ${projectDir}\n`);
  }
  
  const results: { file: string; status: string; weight: number }[] = [];
  let score = 0;

  for (const file of mandatoryFiles) {
    const exists = fs.existsSync(path.join(projectDir, file));
    if (exists) {
      const content = fs.readFileSync(path.join(projectDir, file), 'utf8');
      const isPlaceholder = content.length < 100 || content.includes('Descreva');
      
      results.push({
        file,
        status: isPlaceholder ? 'WARN Placeholder' : 'OK',
        weight: isPlaceholder ? 0.5 : 1
      });
      score += isPlaceholder ? 0.5 : 1;
    } else {
      results.push({ file, status: 'FAIL Faltando', weight: 0 });
    }
  }

  results.forEach(r => {
    console.log(`${r.status.padEnd(12)} | ${r.file}`);
  });

  const finalScore = (score / mandatoryFiles.length) * 100;
  console.log(`\nScore de Maturidade: ${finalScore.toFixed(0)}%`);

  if (finalScore < 70) {
    console.log('\nAlerta: o projeto precisa de mais documentacao de fundacao antes de escalar.');
    process.exit(1);
  } else {
    console.log('\nProjeto saudavel e pronto para execucao acelerada.');
  }
}

try {
  check();
} catch (e) {
  console.error('Erro ao verificar padrões:', e.message);
}
