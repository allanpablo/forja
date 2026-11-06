#!/usr/bin/env node

/**
 * Token Economy Benchmark - Measure token savings from smart context
 * 
 * Compara:
 * 1. Full context (antes) vs 3 modos (depois)
 * 2. Mede tamanho, tokens, tempo de geração
 * 3. Calcula redução %
 * 
 * Uso: npm run token:benchmark
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import ContextBuilder from '../lib/context-builder.ts';
import { fileURLToPath } from 'node:url';
import { getDbPath, ensureSchema } from './memory-schema.ts';
import { pkgRoot, script } from '../lib/paths.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = pkgRoot;

/**
 * Estimar tokens (1KB ≈ 250 tokens, aproximação)
 */
function estimateTokens(content: any) {
  const size = typeof content === 'number' ? content : content.length;
  return Math.round(size / 4); // 1 token ~= 4 bytes
}

/**
 * Formatar bytes em legível
 */
function formatBytes(bytes: any) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}

function walkMarkdown(dir: any, out: string[] = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.memory', 'archive'].includes(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walkMarkdown(abs, out);
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(abs);
  }
  return out;
}

/**
 * O projeto de referência sai do banco, não de um nome chutado. O benchmark media
 * 'benchmark-project', que não existe em lugar nenhum: domain e task voltavam só com os nós globais e
 * o relatório anunciava ~99% de "economia" por não ter injetado quase nada (achado da SPEC-057 —
 * medição que não mede é pior que medição nenhuma, porque decide no escuro com ar de número).
 */
function referenceProject(dbPath: string): { name: string; nodes: number } | null {
  const db = new Database(dbPath, { readonly: true });
  try {
    const row = db.prepare(`
      SELECT p.name AS name, COUNT(n.id) AS nodes
      FROM projects p JOIN memory_nodes n ON n.project_id = p.id
      GROUP BY p.id ORDER BY nodes DESC LIMIT 1
    `).get() as { name: string; nodes: number } | undefined;
    return row && row.nodes > 0 ? row : null;
  } finally {
    db.close();
  }
}

/** Nós injetados no pacote. Comparado com o do modo global, diz se o projeto contribuiu com algo. */
function nodesIn(pack: string): number {
  return (pack.match(/^## 📄 /gm) || []).length;
}

/**
 * Termo do modo task: um que existe no projeto (o primeiro domínio indexado, senão o primeiro slug de
 * spec). O termo chutado em inglês que estava aqui antes — 'architecture implementation' — não casa
 * com memória em pt-BR, e o modo task media um pacote sem nenhum nó do projeto.
 */
function taskKeyword(dbPath: string, project: string): string {
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db.prepare(`
      SELECT n.path AS path FROM memory_nodes n JOIN projects p ON p.id = n.project_id
      WHERE p.name = ? ORDER BY n.path LIMIT 200
    `).all(project) as { path: string }[];
    for (const row of rows) {
      const domain = /30-domains\/([^/]+)\//.exec(row.path)?.[1];
      if (domain) return domain;
    }
    const spec = rows.find((r) => r.path.includes('specs/'));
    return spec ? path.basename(path.dirname(spec.path)) : 'regra';
  } finally {
    db.close();
  }
}

/**
 * Cenário de referência da SPEC-057 (AC-2): um projeto descartável com 60 nós de ~2,5KB — o volume
 * mínimo que o critério pede — gerado com texto fixo. Fixo porque número de economia que muda entre
 * máquinas ou execuções não é evidência, é ruído.
 *
 * Os três termos cobrem os três caminhos do pack: FTS (casa e devolve `snippet()`), LIKE (substring
 * no meio de palavra, que o porter não casa → janela calculada aqui) e nenhum (só globais).
 */
const REF_PROJECT = 'ref-spec-057';
const REF_NODES = 60;
const REF_KEYWORDS = ['pagamentos', 'pagament', 'pagamentosavancado', 'termo-inexistente'];

function refNodeBody(i: number, termo: string): string {
  let body = `# Nota ${i} de ${termo}\n\n`;
  for (let s = 0; s < 6; s++) {
    body += `## Seção ${s}\n\n`;
    body += `Este nó documenta a regra de ${termo} aplicada ao fluxo de pedidos: o agregado valida o ` +
      `invariante, o repositório persiste e a apresentação traduz o resultado. O recálculo de ${termo} ` +
      `usa duas casas decimais e publica evento com o identificador idempotente da tentativa anterior, ` +
      `o que evita duplicidade no consumidor a jusante.\n\n`;
    body += '- item de lista com contexto suficiente para ocupar uma linha inteira\n- outro item\n';
  }
  return body;
}

interface RefRow { keyword: string; nodes: number; trecho: number; integral: number; corte: number }

function referenceScenario(): RefRow[] {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-ref-'));
  try {
    const proj = path.join(ws, 'projects', REF_PROJECT);
    const write = (rel: string, body: string) => {
      const abs = path.join(proj, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, body);
    };
    for (let i = 0; i < REF_NODES; i++) {
      write(path.join('memory', '30-domains', `dom${i % 6}`, `nota-${i}.md`), refNodeBody(i, i % 3 === 0 ? 'pagamentos' : 'cobranca'));
    }
    write(path.join('docs', 'guia-pagamentosavancado.md'), refNodeBody(900, 'pagamentosavancado'));

    const sync = spawnSync(process.execPath, [script('bin/forja'), 'sync:universal'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, FORJA_WORKSPACE: ws },
    });
    if (sync.status !== 0) throw new Error(`sync do cenário de referência falhou: ${sync.stderr || sync.stdout}`);

    const builder = new ContextBuilder(proj, path.join(ws, 'memory', 'sqlite', 'universal.db'));
    try {
      return REF_KEYWORDS.map((keyword) => {
        const trecho = builder.build('task', REF_PROJECT, keyword);
        const integral = builder.build('task', REF_PROJECT, keyword, { full: true });
        const a = estimateTokens(trecho.length);
        const b = estimateTokens(integral.length);
        return { keyword, nodes: nodesIn(trecho), trecho: a, integral: b, corte: b === 0 ? 0 : Math.round(((b - a) / b) * 100) };
      });
    } finally {
      builder.close();
    }
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
}

function referenceScenarioReport(rows: RefRow[] | null): void {
  console.log(`Cenário de referência SPEC-057 — ${REF_NODES} nós gerados, trecho FTS5 vs conteúdo integral\n`);
  if (!rows) {
    console.warn('   não foi possível medir\n');
    return;
  }
  for (const r of rows) {
    console.log(`   "${r.keyword}"`.padEnd(28) + `${String(r.nodes).padStart(3)} nós · trecho ${String(r.trecho).padStart(6)} vs integral ${String(r.integral).padStart(6)} tokens · −${r.corte}%`);
  }
  // O AC-2 olha o termo que casa: é para ele que o `snippet()` existe. O termo sem casamento entra na
  // tabela como controle — ali o pacote é só o global, e a redução diz respeito à política de cabeça.
  const fts = rows.find((r) => r.keyword === 'pagamentos');
  if (fts) console.log(`\n   Meta AC-2 (≥ 50% no termo que casa): −${fts.corte}% → ${fts.corte >= 50 ? '✅' : '❌'}\n`);
  else console.log('');
}

/**
 * Executar benchmark
 */
async function benchmark() {
  console.log('Token Economy Benchmark\n');

  ensureSchema({ silent: true });
  const dbPath = getDbPath();

  if (!fs.existsSync(dbPath)) {
    console.warn('Database not found at:', dbPath);
    console.log('   Run: npm run memory:db:init');
    process.exit(1);
  }

  // O cenário de referência da SPEC-057 vem antes: não depende de projeto indexado e é o número
  // reproduzível (mesma fixture, qualquer máquina) que a evidência do AC-2 cita.
  let refRows: RefRow[] | null = null;
  try {
    refRows = referenceScenario();
  } catch (e) {
    console.warn(`   medir o cenário de referência falhou: ${(e as Error).message}`);
  }
  referenceScenarioReport(refRows);

  const ref = referenceProject(dbPath);
  if (!ref) {
    console.warn('Nenhum projeto indexado no banco — os modos domain/task do SEU projeto ficaram de fora.');
    console.log('   Rode dentro de um projeto: forja sync:universal\n');
    return;
  }
  const project = ref.name;
  console.log(`Projeto indexado: ${project} (${ref.nodes} nós)\n`);

  const builder = new ContextBuilder(root, dbPath);

  try {
    // 1. Simular contexto "antigo" (sem smart context)
    console.log('Scenario 1: Full Context (Baseline - No Optimization)\n');

    const baselineStart = Date.now();
    let fullContext = '';

    const baselineRoots = ['AGENTS.md', 'README.md', 'DOC-MAP.md', 'memory', 'docs', 'prompts', 'specs'];
    const baselineFiles: string[] = [];
    for (const rel of baselineRoots) {
      const abs = path.join(root, rel);
      if (!fs.existsSync(abs)) continue;
      const stat = fs.statSync(abs);
      if (stat.isDirectory()) walkMarkdown(abs, baselineFiles);
      else if (stat.isFile() && abs.endsWith('.md')) baselineFiles.push(abs);
    }

    for (const filePath of baselineFiles) {
      const rel = path.relative(root, filePath);
      const content = fs.readFileSync(filePath, 'utf8');
      fullContext += `\n\n## ${rel}\n${content}`;
    }

    const baselineDuration = Date.now() - baselineStart;
    const baselineSize = fullContext.length;
    const baselineTokens = estimateTokens(fullContext);
    const baselineCost = (baselineTokens * 0.00001).toFixed(5);

    console.log(`   Size: ${formatBytes(baselineSize)}`);
    console.log(`   Tokens: ${baselineTokens.toLocaleString()}`);
    console.log(`   Files: ${baselineFiles.length}`);
    console.log(`   Time: ${baselineDuration}ms`);
    console.log(`   Cost: $${baselineCost}\n`);

    // 2. Testar 3 modos de contexto inteligente
    const modes = ['global', 'domain', 'task'];
    const keywordTask = taskKeyword(dbPath, project);
    const results: { mode: string; size: number; tokens: number; time: number; cost: number; savings: number }[] = [];
    let globalNodes = 0;
    let excerptAxis: { trecho: number; integral: number; corte: number } | null = null;

    for (const mode of modes) {
      console.log(`Scenario: ${mode.toUpperCase()} Mode\n`);

      const keyword = mode === 'task' ? keywordTask : '';
      const start = Date.now();

      let context = '';
      try {
        context = builder.build(mode, project, keyword);
      } catch (e) {
        console.warn(`   Error building context: ${e.message}`);
        console.log('   Skipping this mode.\n');
        continue;
      }

      const duration = Date.now() - start;
      const size = context.length;
      const tokens = estimateTokens(size);
      const cost = (tokens * 0.00001).toFixed(5);
      const savings = (((baselineTokens - tokens) / baselineTokens) * 100).toFixed(1);
      const nodes = nodesIn(context);
      if (mode === 'global') globalNodes = nodes;

      console.log(`   Size: ${formatBytes(size)}`);
      console.log(`   Tokens: ${tokens.toLocaleString()}`);
      console.log(`   Nodes: ${nodes}`);
      console.log(`   Time: ${duration}ms`);
      console.log(`   Cost: $${cost}`);
      console.log(`   Savings: ${savings}% (vs baseline)`);
      // Sem isto o relatório anuncia economia por não ter injetado nada: se domain/task não trazem um
      // nó a mais que global, o projeto não entrou no pacote e o número não mede o que diz medir.
      if (mode !== 'global' && nodes <= globalNodes) {
        console.log(`   ⚠️ nenhum nó do projeto além dos globais — economia vazia, não conte este número`);
      }
      console.log('');

      // Eixo SPEC-057: o mesmo pacote com o conteúdo integral de cada nó (--full-context) vs o trecho
      // casado que o FTS devolve. É a redução que o corte de trecho compra, medida no projeto real.
      if (mode === 'task') {
        const integral = estimateTokens(builder.build(mode, project, keyword, { full: true }).length);
        const corte = integral === 0 ? 0 : Math.round(((integral - tokens) / integral) * 100);
        console.log(`   Trecho vs integral (SPEC-057): ${tokens.toLocaleString()} vs ${integral.toLocaleString()} tokens → −${corte}%`);
        console.log(`   Meta AC-2: ≥ 50% → ${corte >= 50 ? '✅' : '❌'}\n`);
        excerptAxis = { trecho: tokens, integral, corte };
      }

      results.push({
        mode,
        size,
        tokens,
        time: duration,
        cost: parseFloat(cost),
        savings: parseFloat(savings),
      });
    }

    // 3. Sumário
    console.log('Summary\n');

    const avgSavings =
      results.reduce((sum, r) => sum + r.savings, 0) / results.length;
    const avgTokens = results.reduce((sum, r) => sum + r.tokens, 0) / results.length;
    const avgCost = results.reduce((sum, r) => sum + r.cost, 0) / results.length;
    const bestMode = results.reduce((best, r) => (r.tokens < best.tokens ? r : best));

    console.log(`Baseline (Full Context)`);
    console.log(`  Tokens: ${baselineTokens.toLocaleString()}`);
    console.log(`  Cost: $${baselineCost}\n`);

    console.log(`Smart Context Average`);
    console.log(`  Tokens: ${avgTokens.toLocaleString()}`);
    console.log(`  Cost: $${avgCost.toFixed(5)}`);
    console.log(`  Savings: ${avgSavings.toFixed(1)}%\n`);

    console.log(`Best Mode: ${bestMode.mode.toUpperCase()}`);
    console.log(`  Tokens: ${bestMode.tokens.toLocaleString()}`);
    console.log(`  Cost: $${bestMode.cost.toFixed(5)}`);
    console.log(`  Savings: ${bestMode.savings.toFixed(1)}%\n`);

    if (excerptAxis) {
      console.log(`Trecho vs integral (SPEC-057, modo task em ${project})`);
      console.log(`  Com snippet FTS5:  ${excerptAxis.trecho.toLocaleString()} tokens`);
      console.log(`  Conteúdo integral: ${excerptAxis.integral.toLocaleString()} tokens`);
      console.log(`  Redução: −${excerptAxis.corte}% (meta AC-2: ≥ 50%)\n`);
    }

    // 4. Cálculo de ROI
    const monthlyRequests = 1000;
    const savedCostPerMonth = (baselineTokens - avgTokens) * 0.00001 * monthlyRequests;

    console.log('ROI Analysis (1000 requests/month)');
    console.log(`  Baseline cost: $${(baselineTokens * 0.00001 * monthlyRequests).toFixed(2)}`);
    console.log(`  Smart cost: $${(avgTokens * 0.00001 * monthlyRequests).toFixed(2)}`);
    console.log(`  Monthly savings: $${savedCostPerMonth.toFixed(2)}`);
    console.log(`  Annual savings: $${(savedCostPerMonth * 12).toFixed(2)}\n`);

    // 5. Recomendação
    console.log('Recommendation');
    if (avgSavings > 40) {
      console.log(`   Deploy: ${avgSavings.toFixed(1)}% savings exceeds 40% target.`);
    } else if (avgSavings > 20) {
      console.log(`   Good savings (${avgSavings.toFixed(1)}%) but optimize further.`);
    } else {
      console.log(`   Savings too low (${avgSavings.toFixed(1)}%). Review strategy.`);
    }

    console.log('\nBenchmark complete.\n');
  } catch (e) {
    console.error('Benchmark error:', e.message);
    process.exit(1);
  } finally {
    builder.close();
  }
}

// Run if called via CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  benchmark().catch(console.error);
}

export {
  benchmark,
  estimateTokens,
  formatBytes,
  walkMarkdown,
  nodesIn,
  referenceProject,
  referenceScenario,
  referenceScenarioReport,
  taskKeyword,
};
