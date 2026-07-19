#!/usr/bin/env node

/**
 * Memory Vacuum - Comprime e limpa memória antiga do projeto
 * 
 * Objetivo: Manter .memory/sqlite/ < 50MB removendo:
 * - Logs > 30 dias (moves para archive)
 * - Índices sem referência
 * - Cache expirado (TTL)
 * 
 * Uso: npm run memory:vacuum
 */

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { getDbPath, ensureSchema } from './memory-schema.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// Configuração de defaults (pode ser sobrescrita por .memoryrc.json)
const DEFAULT_CONFIG = {
  archiveAge: 30, // dias
  maxDbSize: 50, // MB
  cacheTtl: 7, // dias
  vacuumInterval: 86400000, // ms (1 dia)
};

function loadConfig() {
  const configPath = path.join(root, '.memoryrc.json');
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf8')).compression || {};
  }
  return {};
}

function getDbSize(dbPath: any) {
  if (!fs.existsSync(dbPath)) return 0;
  const stats = fs.statSync(dbPath);
  return stats.size / (1024 * 1024); // MB
}

function archiveOldLogs(dbPath: any, ageInDays: any) {
  console.log(`📦 Archiving logs older than ${ageInDays} days...`);

  const db = new Database(dbPath);
  const archiveDir = path.join(path.dirname(dbPath), 'archive');

  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }

  try {
    // 1. Buscar runs antigos
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - ageInDays);

    const oldRuns = db
      .prepare(
        `
      SELECT id, project_id, completed_at, log_content 
      FROM memory_runs
      WHERE completed_at < ?
      LIMIT 100
    `
      )
      .all(cutoffDate.toISOString());

    console.log(`   Found ${oldRuns.length} old runs to archive`);

    // 2. Mover para arquivo
    let archived = 0;
    for (const run of oldRuns) {
      const filename = `run-${run.id}-${run.completed_at.split('T')[0]}.json`;
      const filepath = path.join(archiveDir, filename);

      fs.writeFileSync(filepath, JSON.stringify(run, null, 2), 'utf8');

      // 3. Deletar do DB
      db.prepare('DELETE FROM memory_runs WHERE id = ?').run(run.id);
      archived++;
    }

    console.log(`   ✅ Archived ${archived} runs`);

    // 4. Cleanup de índices vazios
    const emptyNodes = db
      .prepare(
        `
      SELECT COUNT(*) as cnt FROM memory_nodes 
      WHERE content IS NULL OR content = ''
    `
      )
      .get();

    if (emptyNodes.cnt > 0) {
      console.log(`   🗑️ Removing ${emptyNodes.cnt} empty nodes...`);
      db.prepare('DELETE FROM memory_nodes WHERE content IS NULL OR content = ""')
        .run();
    }

    db.exec('VACUUM;'); // Compactar DB
    console.log(`   ✨ Database compacted`);

    db.close();
  } catch (e) {
    console.error('   ❌ Error archiving:', e.message);
    db.close();
    throw e;
  }
}

function cleanExpiredCache(cacheDir: any, ttlInDays: any) {
  console.log(`🧹 Cleaning expired cache (TTL: ${ttlInDays} days)...`);

  if (!fs.existsSync(cacheDir)) {
    console.log('   (No cache directory)');
    return 0;
  }

  const files = fs.readdirSync(cacheDir);
  const cutoffTime = Date.now() - ttlInDays * 86400000;
  let removed = 0;

  for (const file of files) {
    const filepath = path.join(cacheDir, file);
    const stats = fs.statSync(filepath);

    if (stats.mtimeMs < cutoffTime) {
      fs.unlinkSync(filepath);
      removed++;
    }
  }

  console.log(`   ✅ Removed ${removed} expired cache files`);
  return removed;
}

function reportStats(dbPath: any, beforeSize: any) {
  const afterSize = getDbSize(dbPath);
  const saved = beforeSize - afterSize;
  const percent = ((saved / beforeSize) * 100).toFixed(1);

  console.log(`\n📊 Compression Report:`);
  console.log(`   Before: ${beforeSize.toFixed(2)} MB`);
  console.log(`   After:  ${afterSize.toFixed(2)} MB`);
  console.log(`   Saved:  ${saved.toFixed(2)} MB (${percent}%)`);

  if (afterSize > DEFAULT_CONFIG.maxDbSize) {
    console.warn(
      `   ⚠️  Database still > ${DEFAULT_CONFIG.maxDbSize}MB. Consider manual cleanup.`
    );
  } else {
    console.log(`   ✨ Database within limits (< ${DEFAULT_CONFIG.maxDbSize}MB)`);
  }
}

async function vacuum() {
  const config = { ...DEFAULT_CONFIG, ...loadConfig() };
  ensureSchema({ silent: true });
  const dbPath = getDbPath();
  const cacheDir = path.join(root, '.context', 'cache');

  console.log('🔧 Memory Vacuum - Compression & Cleanup');
  console.log(`   Config: ${JSON.stringify(config)}\n`);

  if (!fs.existsSync(dbPath)) {
    console.log('⚠️  Database not found. Skipping.');
    return;
  }

  const beforeSize = getDbSize(dbPath);

  try {
    // 1. Archive old runs
    archiveOldLogs(dbPath, config.archiveAge);

    // 2. Clean cache
    cleanExpiredCache(cacheDir, config.cacheTtl);

    // 3. Report
    reportStats(dbPath, beforeSize);

    console.log('\n✅ Memory vacuum complete!');
  } catch (e) {
    console.error('❌ Vacuum failed:', e.message);
    process.exit(1);
  }
}

// Executar se chamado via CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  vacuum().catch(console.error);
}

export { vacuum, getDbSize, archiveOldLogs, cleanExpiredCache };
