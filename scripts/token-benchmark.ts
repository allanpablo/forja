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
import path from 'node:path';
import ContextBuilder from '../lib/context-builder.ts';
import { fileURLToPath } from 'node:url';
import { getDbPath, ensureSchema } from './memory-schema.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

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
 * Executar benchmark
 */
async function benchmark() {
  console.log('Token Economy Benchmark\n');

  ensureSchema({ silent: true });
  const dbPath = getDbPath();
  const project = 'benchmark-project';

  if (!fs.existsSync(dbPath)) {
    console.warn('Database not found at:', dbPath);
    console.log('   Run: npm run memory:db:init');
    process.exit(1);
  }

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
    const results: { mode: string; size: number; tokens: number; time: number; cost: number; savings: number }[] = [];

    for (const mode of modes) {
      console.log(`Scenario: ${mode.toUpperCase()} Mode\n`);

      const keyword = mode === 'task' ? 'architecture implementation' : '';
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

      console.log(`   Size: ${formatBytes(size)}`);
      console.log(`   Tokens: ${tokens.toLocaleString()}`);
      console.log(`   Time: ${duration}ms`);
      console.log(`   Cost: $${cost}`);
      console.log(`   Savings: ${savings}% (vs baseline)\n`);

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

export { benchmark, estimateTokens };
