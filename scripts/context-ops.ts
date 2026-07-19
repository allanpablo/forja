#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { ensureSchema, getDbPath } from './memory-schema.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, '.context');
const defaultLimit = readTokenLimit();

function estimateTokens(content: any) {
  return Math.ceil(content.length / 4);
}

function readTokenLimit() {
  const configPath = path.join(root, '.memoryrc.json');
  if (!fs.existsSync(configPath)) return 8000;
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return Number(config?.tokenLimits?.task) || 8000;
  } catch {
    return 8000;
  }
}

function ensureOutDir() {
  fs.mkdirSync(outDir, { recursive: true });
}

function readIfExists(relPath: any, maxChars = 12000) {
  const full = path.join(root, relPath);
  if (!fs.existsSync(full)) return '';
  return fs.readFileSync(full, 'utf8').slice(0, maxChars);
}

function firstHeading(content: any, fallback: any) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

function specStatus(content: any) {
  const match = content.match(/-\s+\*\*Status\*\*:\s+([^\n]+)/);
  return match ? match[1].trim() : 'unknown';
}

function extractSection(content: any, heading: any, maxChars = 2200) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^##\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=^##\\s+|$)`, 'm');
  const match = content.match(re);
  return match ? match[1].trim().slice(0, maxChars) : '';
}

function listSpecs() {
  const specsDir = path.join(root, 'specs');
  if (!fs.existsSync(specsDir)) return [];
  return fs.readdirSync(specsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .map((entry) => {
      const slug = entry.name;
      const specPath = path.join(specsDir, slug, 'spec.md');
      const planPath = path.join(specsDir, slug, 'plan.md');
      const tasksPath = path.join(specsDir, slug, 'tasks.md');
      const spec = fs.existsSync(specPath) ? fs.readFileSync(specPath, 'utf8') : '';
      return {
        slug,
        title: spec ? firstHeading(spec, slug) : slug,
        status: spec ? specStatus(spec) : 'missing',
        hasPlan: fs.existsSync(planPath),
        hasTasks: fs.existsSync(tasksPath),
        path: path.relative(root, specPath),
      };
    });
}

function openDb() {
  ensureSchema({ silent: true });
  return new Database(getDbPath(), { timeout: 5000 });
}

/** @param {number|null} [limitTokens] */
function recordContextRun(kind: any, slug: any, filePath: any, content: any, limitTokens: number | null = null) {
  const db = openDb();
  const tokens = estimateTokens(content);
  const status = limitTokens && tokens > limitTokens ? 'over_budget' : 'ok';
  db.prepare(`
    INSERT INTO context_runs (created_at, kind, slug, path, bytes, estimated_tokens, limit_tokens, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(new Date().toISOString(), kind, slug || null, path.relative(root, filePath), content.length, tokens, limitTokens, status);
  db.close();
}

function upsertSpecSummary(slug: any, content: any) {
  const db = openDb();
  const title = firstHeading(content, slug);
  const status = specStatus(content);
  const problem = extractSection(content, '1. Problema', 900);
  const value = extractSection(content, '2. Proposta de valor', 700);
  const ac = extractSection(content, '4. Criterios de aceite', 1200) || extractSection(content, '4. Critérios de aceite', 1200);
  const summary = [`## Problema\n${problem}`, `## Valor\n${value}`, `## AC\n${ac}`]
    .filter((part) => !part.endsWith('\n'))
    .join('\n\n')
    .slice(0, 3500);
  db.prepare(`
    INSERT INTO spec_summaries (slug, status, title, summary, source_path, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      status=excluded.status,
      title=excluded.title,
      summary=excluded.summary,
      source_path=excluded.source_path,
      updated_at=excluded.updated_at
  `).run(slug, status, title, summary, `specs/${slug}/spec.md`, new Date().toISOString());
  db.close();
}

function getOpenHandoffs(slug: any = null) {
  if (!fs.existsSync(getDbPath())) return [];
  const db = openDb();
  let rows;
  try {
    rows = slug
      ? db.prepare("SELECT id, created_at, from_agent, to_agent, intent, status, context, acceptance FROM handoffs WHERE spec_slug = ? AND status != 'archived' ORDER BY id DESC LIMIT 10").all(slug)
      : db.prepare("SELECT id, created_at, from_agent, to_agent, intent, status, spec_slug, context, acceptance FROM handoffs WHERE status = 'open' ORDER BY id DESC LIMIT 20").all();
  } catch {
    rows = [];
  }
  db.close();
  return rows;
}

function latestAdrs() {
  const dir = path.join(root, 'memory', '90-decisions');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith('.md') && file !== '_template.md')
    .sort()
    .slice(-6)
    .map((file) => {
      const rel = path.join('memory/90-decisions', file);
      const content = readIfExists(rel, 1500);
      return { rel, title: firstHeading(content, file) };
    });
}

function cmdBudget([target, limitArg]: string[]) {
  if (!target) {
    console.error('Uso: context-ops budget <slug|arquivo> [limite_tokens]');
    process.exit(1);
  }
  const limit = Number(limitArg) || defaultLimit;
  const candidates = [
    target,
    `.context/gsd-${target}.md`,
    `.context/agent-brief-${target}.md`,
    `.context/context-task.md`,
  ];
  const file = candidates.map((candidate) => path.resolve(root, candidate)).find((candidate) => fs.existsSync(candidate));
  if (!file || !file.startsWith(root)) {
    console.error(`Arquivo ou slug nao encontrado: ${target}`);
    process.exit(1);
  }
  const content = fs.readFileSync(file, 'utf8');
  const tokens = estimateTokens(content);
  const status = tokens <= limit ? 'OK' : 'FAIL';
  recordContextRun('budget', path.basename(target), file, content, limit);
  console.log(`${status} ${path.relative(root, file)}: ${tokens} tokens estimados / limite ${limit}`);
  if (tokens > limit) process.exit(1);
}

function cmdSprintPack() {
  ensureOutDir();
  const sprint = readIfExists('memory/40-delivery/current-sprint.md', 6000) || 'Nenhuma sprint ativa.';
  const activeSpecs = listSpecs()
    .filter((spec) => ['approved', 'implementing', 'review'].includes(spec.status))
    .slice(0, 12);
  const handoffs = getOpenHandoffs();
  const adrs = latestAdrs();

  let md = `# Sprint Pack\n\n`;
  md += `- **Gerado em**: ${new Date().toISOString()}\n`;
  md += `- **Budget alvo**: ${defaultLimit} tokens\n\n`;
  md += `## Sprint Atual\n\n${sprint}\n\n`;
  md += `## Specs Ativas\n\n`;
  md += activeSpecs.length
    ? activeSpecs.map((spec) => `- ${spec.slug}: ${spec.status}; plan=${spec.hasPlan ? 'sim' : 'nao'}; tasks=${spec.hasTasks ? 'sim' : 'nao'}; ${spec.path}`).join('\n')
    : '- Nenhuma spec ativa encontrada.';
  md += `\n\n## Handoffs Abertos\n\n`;
  md += handoffs.length
    ? handoffs.map((h: any) => `- #${h.id} ${h.from_agent} -> ${h.to_agent} (${h.intent}) ${h.spec_slug || ''}: ${String(h.context).slice(0, 180)}`).join('\n')
    : '- Nenhum handoff aberto.';
  md += `\n\n## ADRs Recentes\n\n`;
  md += adrs.length ? adrs.map((adr) => `- ${adr.rel}: ${adr.title}`).join('\n') : '- Nenhuma ADR encontrada.';
  md += `\n\n## Proximo Uso\n\n`;
  md += `- Para tarefa especifica: \`npm run agent:brief -- <role> <slug>\`\n`;
  md += `- Para budget: \`npm run context:budget -- .context/sprint-pack.md\`\n`;

  const outFile = path.join(outDir, 'sprint-pack.md');
  fs.writeFileSync(outFile, md, 'utf8');
  recordContextRun('sprint-pack', null, outFile, md, defaultLimit);
  console.log(`Sprint pack gerado: ${path.relative(root, outFile)} (${estimateTokens(md)} tokens estimados)`);
}

function cmdAgentBrief([role, slug]: string[]) {
  if (!role || !slug) {
    console.error('Uso: context-ops agent-brief <role> <slug>');
    process.exit(1);
  }
  ensureOutDir();
  const spec = readIfExists(`specs/${slug}/spec.md`, 12000);
  if (!spec) {
    console.error(`Spec nao encontrada: specs/${slug}/spec.md`);
    process.exit(1);
  }
  upsertSpecSummary(slug, spec);
  const plan = readIfExists(`specs/${slug}/plan.md`, 7000);
  const tasks = readIfExists(`specs/${slug}/tasks.md`, 7000);
  const gsd = readIfExists(`.context/gsd-${slug}.md`, 5000);
  const handoffs = getOpenHandoffs(slug);

  const sections = [
    ['Problema', extractSection(spec, '1. Problema', 1200)],
    ['Valor', extractSection(spec, '2. Proposta de valor', 900)],
    ['Aceite', extractSection(spec, '4. Criterios de aceite', 1600) || extractSection(spec, '4. Critérios de aceite', 1600)],
    ['Plano tecnico', extractSection(plan, '1. Abordagem tecnica', 1400) || extractSection(plan, '1. Abordagem técnica', 1400)],
    ['Contratos', extractSection(plan, '4. Contratos', 1200)],
    ['Tasks', tasks.split('\n').filter((line) => /^## T\d+/.test(line) || line.includes('- **Paths**') || line.includes('- **Done quando**')).slice(0, 40).join('\n')],
    ['GSD', gsd.split('\n').filter((line) => line.includes('- [ ]') || line.includes('- [x]') || line.includes('Objetivo')).slice(0, 30).join('\n')],
  ];

  let md = `# Agent Brief: ${role} / ${slug}\n\n`;
  md += `- **Role**: ${role}\n`;
  md += `- **Spec status**: ${specStatus(spec)}\n`;
  md += `- **Gerado em**: ${new Date().toISOString()}\n`;
  md += `- **Fonte primaria**: specs/${slug}/spec.md\n\n`;
  for (const [title, body] of sections) {
    if (body) md += `## ${title}\n\n${body}\n\n`;
  }
  md += `## Handoffs Relevantes\n\n`;
  md += handoffs.length
    ? handoffs.map((h: any) => `- #${h.id} [${h.status}] ${h.from_agent} -> ${h.to_agent} (${h.intent}); aceite: ${String(h.acceptance).slice(0, 220)}`).join('\n')
    : '- Nenhum handoff registrado para este slug.';
  md += `\n\n## Comandos de Validacao\n\n`;
  md += `\`\`\`bash\nnpm run gsd:check -- ${slug}\nnpm run spec:check -- ${slug}\nnpm run project:check\n\`\`\`\n`;

  const outFile = path.join(outDir, `agent-brief-${role}-${slug}.md`);
  fs.writeFileSync(outFile, md, 'utf8');
  recordContextRun('agent-brief', slug, outFile, md, defaultLimit);
  console.log(`Agent brief gerado: ${path.relative(root, outFile)} (${estimateTokens(md)} tokens estimados)`);
}

function summarizeReadme(relPath: any) {
  const content = readIfExists(relPath, 2500);
  const title = firstHeading(content, path.basename(path.dirname(relPath)));
  const lines = content.split('\n')
    .filter((line) => line.trim() && !line.startsWith('```'))
    .slice(0, 10)
    .join(' ')
    .replace(/\s+/g, ' ')
    .slice(0, 450);
  return { title, summary: lines };
}

function keywordTags(text: any, candidates: any) {
  const lower = text.toLowerCase();
  return candidates.filter((tag: any) => lower.includes(tag.toLowerCase()));
}

function inferBoilerplateManifest(name: any, relPath: any) {
  const readme = readIfExists(relPath, 8000);
  const lower = `${name} ${readme}`.toLowerCase();
  const stack = keywordTags(lower, ['NestJS', 'Next.js', 'React', 'Docker', 'Turborepo', 'RabbitMQ', 'JWT', 'SQLite', 'Postgres']);
  const useCases = keywordTags(lower, ['API REST', 'SaaS', 'E-Commerce', 'Microserviços', 'Monorepo', 'Dashboard', 'Admin', 'Billing', 'Auth']);
  const commands = ['npm install'];
  if (lower.includes('start:dev')) commands.push('npm run start:dev');
  if (lower.includes('docker-compose') || lower.includes('docker compose')) commands.push('docker compose up -d');
  if (lower.includes('test')) commands.push('npm test');

  return {
    schemaVersion: '1.0',
    type: 'boilerplate',
    name,
    title: firstHeading(readme, name),
    path: path.dirname(relPath),
    readme: relPath,
    stack,
    useCases,
    commands,
    gates: ['npm run spec:check', 'npm test', 'npm run project:check'],
    tokenPolicy: {
      firstRead: ['boilerplate.manifest.json', 'README.md'],
      avoidLoadingByDefault: ['node_modules', 'dist', 'coverage'],
    },
  };
}

function inferDesignManifest(name: any, relPath: any) {
  const readme = readIfExists(relPath, 8000);
  const lower = `${name} ${readme}`.toLowerCase();
  const surfaces: string[] = [];
  if (['linear.app', 'cursor', 'raycast', 'sentry', 'posthog', 'claude'].includes(name)) surfaces.push('agent-console', 'ops');
  if (['stripe', 'linear.app', 'posthog', 'sentry', 'supabase'].includes(name)) surfaces.push('dashboard');
  if (['mintlify', 'stripe', 'vercel', 'resend', 'hashicorp'].includes(name)) surfaces.push('docs');
  if (['figma', 'miro', 'notion', 'raycast'].includes(name)) surfaces.push('tool');
  if (['wise', 'revolut', 'coinbase', 'kraken'].includes(name)) surfaces.push('fintech');
  if (['apple', 'bmw', 'ferrari', 'tesla', 'lamborghini'].includes(name)) surfaces.push('premium');

  return {
    schemaVersion: '1.0',
    type: 'design-reference',
    name,
    title: firstHeading(readme, name),
    path: path.dirname(relPath),
    readme: relPath,
    surfaces: [...new Set(surfaces)],
    traits: keywordTags(lower, ['dashboard', 'docs', 'developer', 'ai', 'agent', 'collaboration', 'fintech', 'observability', 'premium', 'crm']),
    tokenHints: {
      density: lower.includes('dashboard') || lower.includes('ops') ? 'high' : 'medium',
      useWhen: 'Escolha quando a superficie e o tom baterem com MATRIX.md.',
      avoidWhen: 'Evite copiar identidade proprietaria ou carregar README inteiro sem necessidade.',
    },
  };
}

function readJsonIfExists(relPath: any) {
  const full = path.join(root, relPath);
  if (!fs.existsSync(full)) return null;
  try {
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch {
    return null;
  }
}

function cmdGenerateManifests() {
  let written = 0;
  const boilerRoot = path.join(root, 'boilerplates');
  if (fs.existsSync(boilerRoot)) {
    for (const entry of fs.readdirSync(boilerRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const rel = path.join('boilerplates', entry.name, 'README.md');
      if (!fs.existsSync(path.join(root, rel))) continue;
      const manifest = inferBoilerplateManifest(entry.name, rel);
      const outFile = path.join(root, 'boilerplates', entry.name, 'boilerplate.manifest.json');
      fs.writeFileSync(outFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      written++;
    }
  }

  const designRoot = path.join(root, 'design-md');
  if (fs.existsSync(designRoot)) {
    for (const entry of fs.readdirSync(designRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const rel = path.join('design-md', entry.name, 'README.md');
      if (!fs.existsSync(path.join(root, rel))) continue;
      const manifest = inferDesignManifest(entry.name, rel);
      const outFile = path.join(root, 'design-md', entry.name, 'design.manifest.json');
      fs.writeFileSync(outFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      written++;
    }
  }

  console.log(`Manifests gerados: ${written}`);
}

function cmdAssetCatalog() {
  ensureOutDir();
  const assets: { tags: any; manifest: any; title: any; summary: string; type: string; name: string; path: string }[] = [];
  const boilerRoot = path.join(root, 'boilerplates');
  if (fs.existsSync(boilerRoot)) {
    for (const entry of fs.readdirSync(boilerRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const rel = path.join('boilerplates', entry.name, 'README.md');
      if (fs.existsSync(path.join(root, rel))) {
        const data = summarizeReadme(rel);
        const manifest = readJsonIfExists(path.join('boilerplates', entry.name, 'boilerplate.manifest.json'));
        assets.push({
          type: 'boilerplate',
          name: entry.name,
          path: rel,
          ...data,
          tags: manifest ? [...(manifest.stack || []), ...(manifest.useCases || [])].join(',') : data.title,
          manifest,
        });
      }
    }
  }
  const designRoot = path.join(root, 'design-md');
  if (fs.existsSync(designRoot)) {
    for (const entry of fs.readdirSync(designRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const rel = path.join('design-md', entry.name, 'README.md');
      if (fs.existsSync(path.join(root, rel))) {
        const data = summarizeReadme(rel);
        const manifest = readJsonIfExists(path.join('design-md', entry.name, 'design.manifest.json'));
        assets.push({
          type: 'design-reference',
          name: entry.name,
          path: rel,
          ...data,
          tags: manifest ? [...(manifest.surfaces || []), ...(manifest.traits || [])].join(',') : data.title,
          manifest,
        });
      }
    }
  }

  const db = openDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO asset_catalog (type, name, path, summary, tags, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      type=excluded.type,
      name=excluded.name,
      summary=excluded.summary,
      tags=excluded.tags,
      updated_at=excluded.updated_at
  `);
  for (const asset of assets) {
    stmt.run(asset.type, asset.name, asset.path, asset.summary, asset.tags || asset.title, now);
  }
  db.close();

  let md = `# Asset Catalog\n\n- **Gerado em**: ${now}\n- **Total**: ${assets.length}\n\n`;
  for (const type of ['boilerplate', 'design-reference']) {
    md += `## ${type}\n\n`;
    for (const asset of assets.filter((item) => item.type === type)) {
      const tags = asset.tags ? ` [${asset.tags}]` : '';
      md += `- **${asset.name}**${tags}: ${asset.path} — ${asset.summary}\n`;
    }
    md += '\n';
  }
  const outFile = path.join(outDir, 'asset-catalog.md');
  fs.writeFileSync(outFile, md, 'utf8');
  recordContextRun('asset-catalog', null, outFile, md, defaultLimit);
  console.log(`Asset catalog gerado: ${path.relative(root, outFile)} (${assets.length} assets)`);
}

function help() {
  console.log(`Uso: node scripts/context-ops.mjs <command> [args]

Comandos:
  budget <slug|arquivo> [limite]     Mede tokens e falha se passar do limite
  sprint-pack                        Gera .context/sprint-pack.md
  agent-brief <role> <slug>          Gera brief compacto por papel/feature
  asset-catalog                      Cataloga boilerplates e design-md
  manifests                          Gera manifests JSON para boilerplates/design-md
`);
}

const [cmd, ...rest] = process.argv.slice(2);
/** dispatch heterogêneo: cada cmd consome os args do seu jeito (Fase 1) */
const args: any = rest;
switch (cmd) {
  case 'budget': cmdBudget(args); break;
  case 'sprint-pack': cmdSprintPack(); break;
  case 'agent-brief': cmdAgentBrief(args); break;
  case 'asset-catalog': cmdAssetCatalog(); break;
  case 'manifests': cmdGenerateManifests(); break;
  default:
    help();
    process.exit(cmd ? 1 : 0);
}
