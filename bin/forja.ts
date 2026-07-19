#!/usr/bin/env node

/**
 * bin/forja.mjs — core executivo do Forja (ADR-0020).
 *
 * Ponto de entrada único dos comandos de processo:
 *   forja <comando> [args]
 *
 * Responsabilidades transversais:
 *   1. Roteamento via lib/core/registry.mjs (declarativo).
 *   2. Gates antes do alvo (workspace, ADR-0019).
 *   3. Trilha de auditoria append-only em .context/forja-runs.jsonl.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { COMMANDS, DOMAINS, resolveScript } from '../lib/core/registry.ts';
import { getWorkspaceInfo, getWorkspaceContextDir } from '../lib/workspace.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function printHelp() {
  console.log('Forja — core executivo (ADR-0020)');
  console.log('Uso: forja <comando> [args]\n');
  const byDomain = new Map();
  for (const [name, cmd] of Object.entries(COMMANDS)) {
    if (!byDomain.has(cmd.domain)) byDomain.set(cmd.domain, []);
    byDomain.get(cmd.domain).push([name, cmd.desc]);
  }
  for (const [domain, label] of Object.entries(DOMAINS)) {
    const entries = byDomain.get(domain);
    if (!entries) continue;
    console.log(`${label}:`);
    for (const [name, desc] of entries) {
      console.log(`  ${name.padEnd(24)} ${desc}`);
    }
    console.log('');
  }
  console.log('Toda execução é auditada em .context/forja-runs.jsonl (workspace, se existir).');
}

function suggest(input: any) {
  const names = Object.keys(COMMANDS);
  const prefix = input.split(':')[0];
  const near = names.filter((n) => n.startsWith(prefix) || n.includes(input));
  return near.slice(0, 5);
}

// Gates transversais (ADR-0020). Retorna lista de erros bloqueantes.
function runGates(cmd: any) {
  const errors: string[] = [];
  for (const gate of cmd.gates || []) {
    if (gate === 'workspace' || gate === 'workspace-warn') {
      const info = getWorkspaceInfo();
      if (!info.exists) {
        const msg = `Workspace não encontrado em ${info.root} (fonte: ${info.source}).`;
        if (gate === 'workspace') {
          errors.push(`${msg}\n  Corrija com: forja workspace:init`);
        } else {
          console.error(`Aviso: ${msg} Alguns dados podem cair no repo do framework.`);
        }
      }
    }
  }
  return errors;
}

// Auditoria nunca bloqueia o comando (NFR da SPEC-025).
function audit(entry: any) {
  try {
    const info = getWorkspaceInfo();
    const dir = info.exists ? getWorkspaceContextDir() : path.join(root, '.context');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'forja-runs.jsonl'), JSON.stringify(entry) + '\n', 'utf8');
  } catch (error) {
    console.error(`Aviso: auditoria indisponível (${error.message}).`);
  }
}

const [name, ...rest] = process.argv.slice(2);

if (!name || name === 'help' || name === '--help' || name === '-h') {
  printHelp();
  process.exit(0);
}

const cmd = (COMMANDS as any)[name];
if (!cmd) {
  console.error(`Comando desconhecido: ${name}`);
  const near = suggest(name);
  if (near.length) {
    console.error(`Você quis dizer: ${near.join(', ')}?`);
  }
  console.error('Liste tudo com: forja help');
  process.exit(1);
}

const gateErrors = runGates(cmd);
if (gateErrors.length) {
  console.error(`Gate reprovado para ${name}:`);
  for (const err of gateErrors) console.error(`- ${err}`);
  audit({
    ts: new Date().toISOString(),
    cmd: name,
    args: rest,
    exitCode: 1,
    durationMs: 0,
    gate: 'blocked',
  });
  process.exit(1);
}

const started = Date.now();
let result;
if (cmd.node) {
  const script = resolveScript(root, cmd.node);
  result = spawnSync('node', [script, ...(cmd.args || []), ...rest], {
    cwd: root,
    stdio: 'inherit',
  });
} else {
  result = spawnSync(cmd.bin, [...(cmd.args || []), ...rest], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.error && (result.error as any).code === 'ENOENT') {
    console.error(`Binário não encontrado no PATH: ${cmd.bin}. Veja: forja tools:doctor`);
    result.status = 127;
  }
}

const exitCode = result.status ?? 1;
audit({
  ts: new Date().toISOString(),
  cmd: name,
  args: rest,
  exitCode,
  durationMs: Date.now() - started,
});
process.exit(exitCode);
