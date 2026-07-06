#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  initWorkspace,
  getWorkspaceInfo,
  listProjects,
  resolveProject,
  getProjectsDir,
  getWorkspaceProjectsMemoryDir,
} from '../lib/workspace.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const DESIGN_REQUIRED = [
  'Feature/superficie',
  'Persona principal',
  'Objetivo da UI',
  'Referencia primaria',
  'Principios aplicados',
  'Tokens visuais',
  'Componentes esperados',
  'Estados obrigatorios',
  'Criterios de aceite visual',
];

const SURFACE_MAP = {
  'agent-console': ['linear.app', 'cursor', 'raycast', 'sentry', 'posthog', 'claude'],
  ops: ['linear.app', 'cursor', 'raycast', 'sentry', 'posthog', 'claude'],
  dashboard: ['stripe', 'linear.app', 'posthog', 'sentry', 'supabase'],
  docs: ['mintlify', 'stripe', 'vercel', 'resend', 'supabase', 'hashicorp'],
  landing: ['vercel', 'stripe', 'resend', 'cursor', 'x.ai', 'cohere'],
  tool: ['figma', 'miro', 'notion', 'raycast', 'linear.app'],
  fintech: ['wise', 'revolut', 'coinbase', 'stripe', 'kraken'],
  premium: ['apple', 'bmw', 'ferrari', 'tesla', 'lamborghini'],
};

const GSD_HANDOFFS = {
  spec: {
    from: 'orchestrator',
    to: 'product',
    intent: 'spec',
    acceptance: 'spec.md preenchido com problema, escopo dentro/fora, AC testaveis e metrica 30d.',
    constraints: 'pt-BR; nao implementar codigo; registrar ambiguidades no proprio spec.md.',
    return: 'orchestrator',
  },
  plan: {
    from: 'product',
    to: 'sdd-architect',
    intent: 'plan',
    acceptance: 'plan.md criado com abordagem, impactos, ADRs necessarias e riscos explicitos.',
    constraints: 'exige spec.md em approved; nao implementar codigo.',
    return: 'orchestrator',
  },
  implement: {
    from: 'sdd-architect',
    to: 'worker',
    intent: 'implement',
    acceptance: 'tasks.md executado com ownership claro, testes relevantes e sem alterar escopo fora da feature.',
    constraints: 'respeitar arquivos de outros agentes; nao reverter mudancas externas.',
    return: 'governance',
  },
  review: {
    from: 'worker',
    to: 'governance',
    intent: 'review',
    acceptance: 'project:check, spec:check e testes aplicaveis executados; riscos e pendencias reportados.',
    constraints: 'bloquear release se faltar handoff, AC verificavel, seguranca ou conformidade basica.',
    return: 'orchestrator',
  },
};

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function rel(file) {
  return path.relative(root, file);
}

function readText(file) {
  const full = path.resolve(root, file);
  if (!full.startsWith(root)) fail(`Caminho fora do projeto: ${file}`);
  if (!fs.existsSync(full)) fail(`Arquivo nao encontrado: ${file}`);
  return fs.readFileSync(full, 'utf8');
}

// --- Codegraph (ADR-0017): code intelligence como gate do GSD ---

function runCodegraph(args) {
  const result = spawnSync('codegraph', args, { cwd: root, encoding: 'utf8' });
  if (result.error && result.error.code === 'ENOENT') {
    return { missing: true };
  }
  if (result.error && result.error.code === 'EPERM') {
    const quote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;
    const fallback = spawnSync('/bin/sh', ['-lc', ['codegraph', ...args.map(quote)].join(' ')], {
      cwd: root,
      encoding: 'utf8',
    });
    return {
      missing: false,
      status: fallback.status ?? 1,
      stdout: (fallback.stdout || '').trim(),
      stderr: (fallback.stderr || fallback.error?.message || '').trim(),
    };
  }
  return {
    missing: false,
    status: result.status ?? 1,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

// Lê `codegraph status --json` de forma tolerante. Retorna um diagnóstico
// normalizado que `code:check` e `gsd:check` reutilizam.
function codegraphStatus() {
  const res = runCodegraph(['status', '--json']);
  if (res.missing) return { missing: true };
  let data = null;
  try {
    data = JSON.parse(res.stdout);
  } catch {
    return { missing: false, parseError: true, raw: res.stdout || res.stderr };
  }
  const pending = data.pendingChanges || {};
  const pendingTotal = (pending.added || 0) + (pending.modified || 0) + (pending.removed || 0);
  return {
    missing: false,
    initialized: Boolean(data.initialized),
    worktreeMismatch: data.worktreeMismatch || null,
    lastIndexed: data.lastIndexed || null,
    fileCount: data.fileCount || 0,
    pendingTotal,
    reindexRecommended: Boolean(data.index && data.index.reindexRecommended),
  };
}

function cmdCodeCheck() {
  const s = codegraphStatus();
  if (s.missing) {
    console.log('Codegraph nao instalado no PATH. Gate de code intelligence ignorado.');
    console.log('Instale com: npm i -g @codegraph/cli  (ou veja docs/agent-harnesses.md)');
    process.exit(0); // degradacao graciosa: nao bloqueia o fluxo
  }
  if (s.parseError) {
    console.log('Codegraph respondeu, mas status --json nao pode ser lido.');
    console.log(s.raw || 'sem saida');
    fail('\nResultado: status do codegraph ilegivel.');
  }

  const lines = [];
  let blocking = false;

  if (!s.initialized) {
    blocking = true;
    lines.push('FAIL indice ausente: rode `npm run code:index` neste worktree.');
  } else {
    lines.push(`OK   indice inicializado (${s.fileCount} arquivos).`);
  }

  if (s.worktreeMismatch) {
    blocking = true;
    lines.push(`FAIL indice pertence a outro worktree: ${s.worktreeMismatch}. Rode \`codegraph init -i\` aqui.`);
  } else if (s.initialized) {
    lines.push('OK   indice pertence a este worktree.');
  }

  if (s.pendingTotal > 0 || s.reindexRecommended) {
    lines.push(`WARN indice defasado (${s.pendingTotal} mudanca(s) pendente(s)). Rode \`npm run code:sync\`.`);
  } else if (s.initialized) {
    lines.push('OK   indice em dia.');
  }

  console.log('Codegraph check:\n');
  for (const line of lines) console.log(line);
  if (blocking) fail('\nResultado: gate de code intelligence reprovado.');
  console.log('\nResultado: code intelligence confiavel.');
}

function cmdCodeImpact([symbol, depthArg]) {
  if (!symbol) fail('Uso: agent-harness code:impact <simbolo> [profundidade]');
  const res0 = runCodegraph(['status', '--json']);
  if (res0.missing) {
    console.log('Codegraph nao instalado. Sem mapa de impacto automatico.');
    console.log(`Fallback manual: grep -rn "${symbol}" . e leia os chamadores antes de editar.`);
    process.exit(0);
  }
  const depth = String(parseInt(depthArg, 10) || 2);
  console.log(`Mapa de impacto: ${symbol} (profundidade ${depth})\n`);
  const impact = runCodegraph(['impact', symbol, '-d', depth]);
  if (impact.stdout) console.log(impact.stdout);
  if (impact.stderr) console.error(impact.stderr);

  // Complemento: chamadores diretos, util quando impact vem vazio.
  const callers = runCodegraph(['callers', symbol]);
  if (callers.stdout) {
    console.log('\n--- Chamadores diretos ---');
    console.log(callers.stdout);
  }
  if (!impact.stdout && !callers.stdout) {
    console.log('Nenhum no encontrado. Confirme o nome do simbolo ou rode `npm run code:sync`.');
  }
}

function cmdDesignCheck([briefPath]) {
  if (!briefPath) fail('Uso: agent-harness design:check <brief.md>');
  const content = readText(briefPath);
  const missing = DESIGN_REQUIRED.filter((needle) => !content.includes(needle));
  const placeholders = (content.match(/<[^>\n]+>/g) || []).length;

  console.log(`Design brief: ${briefPath}`);
  if (missing.length) {
    console.log('\nCampos ausentes:');
    for (const item of missing) console.log(`- ${item}`);
  }
  if (placeholders) console.log(`\nPlaceholders restantes: ${placeholders}`);

  if (missing.length || placeholders) {
    fail('\nResultado: incompleto para handoff de implementacao.');
  }
  console.log('\nResultado: pronto para handoff visual.');
}

function cmdDesignSelect([surface = 'agent-console', tone = 'tecnico']) {
  const normalized = surface.toLowerCase();
  const refs = SURFACE_MAP[normalized] || SURFACE_MAP.tool;
  console.log(`Superficie: ${surface}`);
  console.log(`Tom: ${tone}`);
  console.log('\nReferencias recomendadas:');
  refs.forEach((name, index) => {
    const file = path.join(root, 'design-md', name, 'README.md');
    const status = fs.existsSync(file) ? rel(file) : 'sem cache local (use o conhecimento publico da referencia)';
    console.log(`${index + 1}. ${name} - ${status}`);
  });
  console.log('\nProximo passo: preencher design-md/BRIEF-TEMPLATE.md com uma referencia primaria.');
}

function cmdHermesHandoff([jsonArg]) {
  if (!jsonArg) fail('Uso: agent-harness hermes:handoff \'<json ADR-0005>\'');
  let payload;
  try {
    payload = JSON.parse(jsonArg);
  } catch (error) {
    fail(`JSON invalido: ${error.message}`);
  }

  const required = ['from', 'to', 'intent', 'context', 'acceptance', 'constraints', 'return'];
  const missing = required.filter((field) => !payload[field] || typeof payload[field] !== 'string');
  if (missing.length) fail(`Campos ADR-0005 ausentes: ${missing.join(', ')}`);

  const result = spawnSync('node', ['scripts/agent-router.mjs', 'append', JSON.stringify(payload)], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

function appendHandoff(payload) {
  const result = spawnSync('node', ['scripts/agent-router.mjs', 'append', JSON.stringify(payload)], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status ?? 1;
}

function cmdGsdPlan([slug = 'run', ...goalParts]) {
  const goal = goalParts.join(' ') || 'execucao orientada por agentes';
  const safeSlug = slug.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  const outDir = path.join(root, '.context');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `gsd-${safeSlug}.md`);
  const specPath = path.join(root, 'specs', safeSlug, 'spec.md');
  const hasSpec = fs.existsSync(specPath);

  const content = `# GSD Runbook: ${safeSlug}

- **Objetivo**: ${goal}
- **Spec**: ${hasSpec ? rel(specPath) : 'nao encontrada'}
- **Gerado em**: ${new Date().toISOString()}

## Gates

- [ ] 1. Briefing: nome, objetivo, contexto, usuarios/papeis, riscos, primeira entrega esperada e slug gerado.
- [ ] 2. Estrutura: pastas, memoria, specs, agentes, scripts, dashboard e dependencias conferidos.
- [ ] 3. Sprints: sprint atual, proxima sprint, backlog e metrica 30d definidos.
- [ ] 4. Contexto: \`npm run dev -- context:build task ${safeSlug} "<keyword>"\`.
- [ ] 5. Mapa de impacto: \`npm run code:check\` e \`npm run code:impact <simbolo>\` para o blast radius antes de planejar/editar (ADR-0017).
- [ ] 6. Spec: problema, escopo e AC testaveis em \`specs/${safeSlug}/spec.md\`.
- [ ] 7. Design: brief aprovado via \`npm run dev -- design:check <brief.md>\`.
- [ ] 8. Plano: plan/tasks aprovados quando houver impacto estrutural.
- [ ] 9. Desenvolvimento: ownership de arquivos definido antes do Worker.
- [ ] 10. Validacao: \`npm run dev -- gsd:check ${safeSlug} <brief.md>\` e \`npm test\`.
- [ ] 11. Governance: \`npm run project:check -- <projeto>\` quando houver projeto alvo.

## Hermes handoffs sugeridos

1. \`npm run gsd:handoff -- spec ${safeSlug}\`
2. \`npm run gsd:handoff -- plan ${safeSlug}\`
3. \`npm run gsd:handoff -- implement ${safeSlug}\`
4. \`npm run gsd:handoff -- review ${safeSlug}\`

## Notas

- Use Hermes para registrar cada passagem com os 7 campos do ADR-0005.
- Antes de editar codigo, rode \`npm run code:impact -- <simbolo>\` para ver chamadores e blast radius (ADR-0017).
- Use \`design-md/MATRIX.md\` para escolher referencia visual antes de construir UI.
- Rode \`npm run gsd:check -- ${safeSlug} <brief.md>\` antes de entregar para Governance.
`;

  fs.writeFileSync(outFile, content, 'utf8');
  console.log(`GSD runbook criado: ${rel(outFile)}`);
  if (!hasSpec) console.log(`Aviso: spec nao encontrada em specs/${safeSlug}/spec.md`);
}

function cmdGsdHandoff([phase, slug, ...contextParts]) {
  if (!phase || !slug) fail('Uso: agent-harness gsd:handoff <spec|plan|implement|review> <slug> [contexto]');
  const template = GSD_HANDOFFS[phase];
  if (!template) fail(`Fase invalida: ${phase}. Use: ${Object.keys(GSD_HANDOFFS).join('|')}`);

  const safeSlug = slug.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  const specDir = path.join(root, 'specs', safeSlug);
  const runbook = path.join(root, '.context', `gsd-${safeSlug}.md`);
  const contextExtra = contextParts.join(' ').trim();
  const context = [
    fs.existsSync(specDir) ? `specs/${safeSlug}` : `specs/${safeSlug} (nao encontrado)`,
    fs.existsSync(runbook) ? rel(runbook) : `.context/gsd-${safeSlug}.md (nao encontrado)`,
    contextExtra,
  ].filter(Boolean).join('; ');

  const payload = {
    ...template,
    context,
    spec_slug: safeSlug,
  };

  process.exit(appendHandoff(payload));
}

function cmdGsdCheck([slug, briefPath]) {
  if (!slug) fail('Uso: agent-harness gsd:check <slug> [brief.md]');
  const safeSlug = slug.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  const checks = [];

  const runbook = path.join(root, '.context', `gsd-${safeSlug}.md`);
  checks.push({
    name: 'GSD runbook',
    ok: fs.existsSync(runbook),
    detail: rel(runbook),
  });

  const specDir = path.join(root, 'specs', safeSlug);
  checks.push({
    name: 'Spec directory',
    ok: fs.existsSync(specDir),
    detail: `specs/${safeSlug}`,
  });

  const specCheck = spawnSync('node', ['scripts/spec-cli.mjs', 'check', safeSlug], {
    cwd: root,
    encoding: 'utf8',
  });
  checks.push({
    name: 'SDD spec check',
    ok: specCheck.status === 0,
    detail: (specCheck.stdout || specCheck.stderr || '').trim() || 'sem saida',
  });

  // Gate de code intelligence (ADR-0017): nao-bloqueante se codegraph ausente,
  // bloqueante se o indice pertence a outro worktree.
  const cg = codegraphStatus();
  if (cg.missing) {
    checks.push({ name: 'Codegraph', ok: true, detail: 'codegraph ausente; gate ignorado' });
  } else if (cg.parseError) {
    checks.push({ name: 'Codegraph', ok: true, detail: 'status ilegivel; verifique com npm run code:check' });
  } else if (cg.worktreeMismatch) {
    checks.push({ name: 'Codegraph', ok: false, detail: `indice de outro worktree (${cg.worktreeMismatch}); rode codegraph init -i` });
  } else if (!cg.initialized) {
    checks.push({ name: 'Codegraph', ok: true, detail: 'indice ausente; rode npm run code:index para habilitar blast radius' });
  } else {
    const stale = cg.pendingTotal > 0 || cg.reindexRecommended;
    checks.push({ name: 'Codegraph', ok: true, detail: stale ? `indice defasado (${cg.pendingTotal} pend.); rode npm run code:sync` : 'indice em dia' });
  }

  if (briefPath) {
    const fullBrief = path.resolve(root, briefPath);
    let ok = false;
    let detail = briefPath;
    if (fullBrief.startsWith(root) && fs.existsSync(fullBrief)) {
      const content = fs.readFileSync(fullBrief, 'utf8');
      const missing = DESIGN_REQUIRED.filter((needle) => !content.includes(needle));
      const placeholders = (content.match(/<[^>\n]+>/g) || []).length;
      ok = missing.length === 0 && placeholders === 0;
      detail = ok ? briefPath : `${briefPath}; missing=${missing.join(',') || 'none'}; placeholders=${placeholders}`;
    } else {
      detail = `${briefPath} nao encontrado`;
    }
    checks.push({ name: 'Design brief', ok, detail });
  } else {
    checks.push({ name: 'Design brief', ok: true, detail: 'nao aplicavel em fluxo CLI-only' });
  }

  console.log(`GSD check: ${safeSlug}\n`);
  for (const check of checks) {
    console.log(`${check.ok ? 'OK ' : 'FAIL'} ${check.name}: ${check.detail}`);
  }

  const failed = checks.filter((check) => !check.ok);
  if (failed.length) fail(`\nResultado: ${failed.length} gate(s) pendente(s).`);
  console.log('\nResultado: gates basicos prontos.');
}

function cmdWorkspaceInit() {
  const infoBefore = getWorkspaceInfo();
  const rootDir = initWorkspace();
  const infoAfter = getWorkspaceInfo();
  console.log(`Workspace inicializado: ${rootDir}`);
  console.log(`Fonte da configuração: ${infoAfter.source}`);
  console.log('Estrutura criada:');
  console.log(`  ${path.join(rootDir, 'projects')}`);
  console.log(`  ${path.join(rootDir, 'memory/sqlite')}`);
  console.log(`  ${path.join(rootDir, 'memory/30-projects')}`);
  console.log(`  ${path.join(rootDir, 'specs')}`);
  console.log(`  ${path.join(rootDir, '.context')}`);
  if (!infoBefore.exists) {
    console.log('\nPróximo passo: npm run dev -- project:new <nome>');
  }
}

function cmdProjectNew([name, ...rest]) {
  if (!name) fail('Uso: agent-harness project:new <nome> [--ai claude,copilot] [--skip-backend]');
  const safeName = name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  const projectDir = resolveProject(safeName);
  if (fs.existsSync(projectDir)) {
    fail(`Projeto ja existe no workspace: ${projectDir}`);
  }

  // Repassa flags para init-project.js
  const result = spawnSync('node', [path.join(root, 'bin/init-project.js'), safeName, ...rest], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  const status = result.status ?? 1;
  if (status === 0) {
    registerProjectCard(safeName, projectDir, rest);
  }
  process.exit(status);
}

// Ficha automática no workspace (ADR-0020): todo projeto nasce rastreado.
function registerProjectCard(name, projectDir, flags) {
  try {
    const cardsDir = getWorkspaceProjectsMemoryDir();
    fs.mkdirSync(cardsDir, { recursive: true });
    const cardPath = path.join(cardsDir, `${name}.md`);
    if (fs.existsSync(cardPath)) return;
    fs.writeFileSync(
      cardPath,
      `# Projeto: ${name}

- **Status**: ativo
- **Criado em**: ${new Date().toISOString().slice(0, 10)}
- **Path**: ${projectDir}
- **Origem**: forja project:new${flags.length ? ` (${flags.join(' ')})` : ''}

## Notas

- Ficha criada automaticamente pelo core (ADR-0020). Complete com objetivo, stack e métrica 30d.
`,
      'utf8'
    );
    console.log(`Ficha registrada: ${cardPath}`);
  } catch (error) {
    console.error(`Aviso: não foi possível registrar a ficha do projeto (${error.message}).`);
  }
}

function cmdProjectList() {
  const info = getWorkspaceInfo();
  const projects = listProjects();
  console.log(`Workspace: ${info.root} (${info.source})`);
  console.log(`Projetos: ${projects.length}`);
  if (!projects.length) {
    console.log('  (nenhum projeto ainda)');
  } else {
    for (const name of projects) {
      console.log(`  • ${name}`);
    }
  }
}

function cmdProjectCheck([name]) {
  if (!name) fail('Uso: agent-harness project:check <nome>');
  const result = spawnSync('node', [path.join(root, 'scripts/check-standards.js'), name], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  process.exit(result.status ?? 1);
}

function showHelp() {
  console.log(`Uso: node scripts/agent-harness.mjs <command> [args]

Workspace:
  workspace:init                Cria estrutura base do workspace Forja
  project:new <nome>            Cria projeto no workspace
  project:list                  Lista projetos do workspace
  project:check <nome>          Valida padroes no projeto do workspace

Pipeline / Handoffs:
  gsd:plan <slug> [objetivo]    Cria runbook GSD em .context/
  gsd:handoff <fase> <slug>     Registra handoff GSD padronizado
  gsd:check <slug> [brief.md]   Valida gates basicos do runbook
  hermes:handoff '<json>'       Registra handoff ADR-0005 via agent-router

Design / Code intelligence:
  design:check <brief.md>       Valida brief visual local
  design:select <surface> [tom] Sugere referencias design-md
  code:check                    Valida indice codegraph (worktree + freshness)
  code:impact <simbolo> [depth] Mostra chamadores e blast radius via codegraph
`);
}

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case 'workspace:init':
    cmdWorkspaceInit();
    break;
  case 'project:new':
    cmdProjectNew(args);
    break;
  case 'project:list':
    cmdProjectList();
    break;
  case 'project:check':
    cmdProjectCheck(args);
    break;
  case 'design:check':
    cmdDesignCheck(args);
    break;
  case 'design:select':
    cmdDesignSelect(args);
    break;
  case 'hermes:handoff':
    cmdHermesHandoff(args);
    break;
  case 'gsd:plan':
    cmdGsdPlan(args);
    break;
  case 'gsd:handoff':
    cmdGsdHandoff(args);
    break;
  case 'gsd:check':
    cmdGsdCheck(args);
    break;
  case 'code:check':
    cmdCodeCheck(args);
    break;
  case 'code:impact':
    cmdCodeImpact(args);
    break;
  default:
    showHelp();
    process.exit(command ? 1 : 0);
}
