import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveProject, initWorkspace, getWorkspaceRoot } from '../lib/workspace.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const [cmd, projectArg, ...args] = process.argv.slice(2);

if (!cmd) {
  console.log('Uso: node scripts/sprint-manager.js <start|status|complete> [projeto|.|root] [args]');
  console.log('       . ou root = framework raiz; outro nome = projeto no workspace');
  process.exit(0);
}

const project = projectArg || '.';
let projectDir;
if (project === '.' || project === 'root') {
  projectDir = root;
} else {
  initWorkspace();
  projectDir = resolveProject(project);
}
const projectLabel = projectDir === root ? 'framework-root' : project;

if (!fs.existsSync(projectDir)) {
  console.error(`Projeto nao encontrado: ${project}`);
  process.exit(1);
}

const backlogFile = path.join(projectDir, 'memory/40-delivery/backlog.md');
const sprintFile = path.join(projectDir, 'memory/40-delivery/current-sprint.md');
const runsDir = path.join(projectDir, 'memory/60-runs');

function startSprint() {
  if (!fs.existsSync(backlogFile)) return console.error('Backlog nao encontrado.');
  
  const backlog = fs.readFileSync(backlogFile, 'utf8');
  const lines = backlog.split('\n');
  
  const toSprint: any[] = [];
  const remaining: any[] = [];
  
  let inPriority = false;
  let hasChecklistPriority = false;
  for (const line of lines) {
    if (line.includes('## Alta Prioridade')) inPriority = true;
    else if (line.startsWith('## ')) inPriority = false;
    
    if (inPriority && line.match(/^[-*]\s+\[\s\]\s+(.+)$/)) {
      toSprint.push(line);
      hasChecklistPriority = true;
    } else {
      remaining.push(line);
    }
  }

  if (toSprint.length === 0) {
    const riceRows = parseRiceBacklog(backlog)
      .filter((item) => ['P0', 'P1'].includes(item.priority))
      .slice(0, Number(args[0]) || 5);

    toSprint.push(...riceRows.map((item) => `- [ ] ${item.priority}: ${item.item} (RICE ${item.rice})`));
  }

  if (toSprint.length === 0) return console.log('Nada para mover para a sprint.');

  const sprintContent = `# Sprint Atual

## Projeto
${projectLabel}

## Objetivos
- Completar itens P0/P1 do backlog com handoffs GSD registrados.

## Itens da Sprint
${toSprint.join('\n')}

## Ritual CLI
- Planejar: npm run gsd:plan -- <slug> "<objetivo>"
- Handoff spec: npm run gsd:handoff -- spec <slug>
- Handoff plan: npm run gsd:handoff -- plan <slug>
- Handoff implement: npm run gsd:handoff -- implement <slug>
- Validar: npm run gsd:check -- <slug>
- Governanca: npm run project:check
`;
  
  fs.writeFileSync(sprintFile, sprintContent, 'utf8');
  if (hasChecklistPriority) fs.writeFileSync(backlogFile, remaining.join('\n'), 'utf8');
  
  console.log(`Sprint iniciada para ${projectLabel} com ${toSprint.length} itens.`);
}

function showStatus() {
  if (!fs.existsSync(sprintFile)) return console.log('Nenhuma sprint ativa.');
  const content = fs.readFileSync(sprintFile, 'utf8');
  console.log(`\n--- Status da Sprint: ${projectLabel} ---\n`);
  console.log(content);
}

function parseRiceBacklog(content) {
  return content
    .split('\n')
    .filter((line) => line.startsWith('| P'))
    .map((line) => line.split('|').map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 8)
    .map((cells) => ({
      priority: cells[1],
      item: cells[2],
      rice: cells[7],
    }))
    .filter((item) => item.priority && item.item && item.rice);
}

function parseChecklistItems(content) {
  const done: any[] = [];
  const pending: any[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const doneMatch = line.match(/^[-*]\s+\[x\]\s+(.+)$/i);
    const pendingMatch = line.match(/^[-*]\s+\[\s\]\s+(.+)$/);
    if (doneMatch) done.push(doneMatch[1]);
    if (pendingMatch) pending.push(pendingMatch[1]);
  }

  return { done, pending };
}

function appendToHighPriorityBacklog(items) {
  if (items.length === 0 || !fs.existsSync(backlogFile)) return;
  const backlog = fs.readFileSync(backlogFile, 'utf8');
  const lines = backlog.split('\n');
  const output: any[] = [];
  let inserted = false;

  for (let i = 0; i < lines.length; i += 1) {
    output.push(lines[i]);
    if (!inserted && lines[i].includes('## Alta Prioridade')) {
      output.push(...items.map((item) => `- [ ] ${item}`));
      inserted = true;
    }
  }

  fs.writeFileSync(backlogFile, output.join('\n'), 'utf8');
}

function completeSprint() {
  if (!fs.existsSync(sprintFile)) return console.log('Nenhuma sprint ativa para encerrar.');
  const content = fs.readFileSync(sprintFile, 'utf8');
  const { done, pending } = parseChecklistItems(content);

  appendToHighPriorityBacklog(pending);
  fs.mkdirSync(runsDir, { recursive: true });

  const now = new Date();
  const stamp = now.toISOString().replace(/[:]/g, '-');
  const reportFile = path.join(runsDir, `sprint-close-${stamp}.md`);
  const report = `# Fechamento de Sprint

## Projeto
${projectLabel}

## Data
${now.toISOString()}

## Entregas concluídas (${done.length})
${done.length ? done.map((item) => `- ${item}`).join('\n') : '- Nenhuma'}

## Pendências realocadas para backlog (${pending.length})
${pending.length ? pending.map((item) => `- ${item}`).join('\n') : '- Nenhuma'}
`;
  fs.writeFileSync(reportFile, report, 'utf8');

  const resetSprint = `# Sprint Atual

## Status
- Encerrada em ${now.toISOString()}
- Nova sprint ainda não iniciada.

## Próximo passo
- Execute: node scripts/sprint-manager.js start ${projectDir === root ? '' : project}
`;
  fs.writeFileSync(sprintFile, resetSprint, 'utf8');

  console.log(`Sprint encerrada para ${projectLabel}.`);
  console.log(`Relatorio: ${path.relative(root, reportFile)}`);
  if (pending.length > 0) {
    console.log(`${pending.length} pendencia(s) devolvida(s) para Alta Prioridade no backlog.`);
  }
}

switch (cmd) {
  case 'start': startSprint(); break;
  case 'status': showStatus(); break;
  case 'complete': completeSprint(); break;
  default: console.log('Comando desconhecido.');
}
