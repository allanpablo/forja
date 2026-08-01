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
import Database from 'better-sqlite3';
import { COMMANDS, DOMAINS, resolveScript } from '../lib/core/registry.ts';
import { getWorkspaceInfo, getWorkspaceContextDir } from '../lib/workspace.ts';
import {
  capabilityIdForCommand,
  createCliCapabilityRuntime,
  executeCliCapability,
  parseLegacyCommandInput,
  type LegacyCliResult,
  type GraphSyncComposition,
} from '../apps/cli/src/index.ts';
import { GitGraphDocumentSource, SpawnCommandRunner } from '../packages/adapter-git/src/index.ts';
import { GraphLoop } from '../packages/graph/src/index.ts';
import { SqliteGraphStore, SqliteMigrationRunner } from '../packages/adapter-sqlite/src/index.ts';
import { getWorkspaceDbDir, getWorkspaceDbPath } from '../lib/workspace.ts';
import type { CapabilityId } from '../packages/contracts/src/index.ts';
import { McpServer } from '../packages/mcp/src/index.ts';

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
  console.log('Capabilities:');
  console.log('  capabilities:list       Lista capabilities descobríveis');
  console.log('  capabilities:describe   Descreve uma capability');
  console.log('  capability:execute      Executa uma capability com input JSON');
  console.log('  mcp:start               Inicia o transporte MCP JSON-RPC por stdio');
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

function runLegacyCaptured(command: string, args: readonly string[]): LegacyCliResult {
  const cmd = (COMMANDS as any)[command];
  if (!cmd) return { exitCode: 127, stdout: '', stderr: `Comando legado não encontrado: ${command}` };
  let result;
  if (cmd.node) {
    const script = resolveScript(root, cmd.node);
    result = spawnSync('node', [script, ...(cmd.args || []), ...args], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } else {
    result = spawnSync(cmd.bin, [...(cmd.args || []), ...args], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: 'pipe',
    });
  }
  const error = result.error;
  const stderr = [result.stderr || '', error ? error.message : ''].filter(Boolean).join('\n');
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout || '',
    stderr,
  };
}

function jsonFlag(args: readonly string[]): boolean {
  return args.includes('--json');
}

function withoutFlag(args: readonly string[], flag: string): string[] {
  return args.filter((arg) => arg !== flag);
}

function printExecutionResult(result: unknown, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(result));
    return;
  }
  const execution = result as { readonly status?: string; readonly output?: { readonly payload?: { readonly stdout?: string; readonly stderr?: string; readonly indexed?: number; readonly skipped?: number; readonly edges?: number; readonly durationMs?: number } }; readonly error?: { readonly message?: string } };
  const payload = execution.output?.payload;
  if (payload?.stdout) process.stdout.write(payload.stdout);
  if (payload?.stderr) process.stderr.write(payload.stderr);
  if (payload && typeof payload.indexed === 'number' && typeof payload.skipped === 'number') console.log(`Graph sync: ${payload.indexed} indexado(s), ${payload.skipped} ignorado(s), ${payload.edges ?? 0} aresta(s) em ${payload.durationMs ?? 0}ms.`);
  if (execution.error?.message) console.error(execution.error.message);
}

async function runCapabilityCommand(command: string, args: readonly string[]): Promise<number> {
  const needsGraph = command === 'graph:sync' || command === 'capability:execute' || command === 'capabilities:list' || command === 'capabilities:describe';
  const runtime = createCliCapabilityRuntime(runLegacyCaptured, needsGraph ? createGraphSyncComposition() : undefined);
  const started = Date.now();
  const json = jsonFlag(args);
  let result: unknown;
  let capabilityId: string | undefined;
  let commandSucceeded = true;
  let inputArgs = withoutFlag(args, '--json');

  if (command === 'capabilities:list') {
    result = runtime.registry.list();
  } else if (command === 'capabilities:describe') {
    const id = inputArgs[0];
    if (!id) {
      result = { error: 'Capability id is required' };
      commandSucceeded = false;
    } else {
      try { result = runtime.registry.describe(id); } catch (error) { result = { error: error instanceof Error ? error.message : 'Capability not found' }; commandSucceeded = false; }
    }
  } else if (command === 'capability:execute') {
    capabilityId = inputArgs.shift();
    const inputIndex = inputArgs.indexOf('--input');
    if (!capabilityId || inputIndex < 0 || inputArgs[inputIndex + 1] === undefined) {
      result = { error: 'Usage: capability:execute <id> --input \'{}\' [--json]' };
      commandSucceeded = false;
    } else {
      try {
        const payload = JSON.parse(inputArgs[inputIndex + 1]);
        result = await executeCliCapability(runtime, capabilityId as CapabilityId, payload);
      } catch (error) {
        result = { error: error instanceof Error ? error.message : 'Invalid capability input' };
        commandSucceeded = false;
      }
    }
  } else {
    const migrated = capabilityIdForCommand(command);
    if (!migrated) return 1;
    capabilityId = migrated;
    try {
      const parsed = parseLegacyCommandInput(command, inputArgs);
      result = await executeCliCapability(runtime, parsed.capabilityId, parsed.payload);
    } catch (error) {
      result = { error: error instanceof Error ? error.message : 'Invalid command input' };
      commandSucceeded = false;
    }
  }

  printExecutionResult(result, json || command.startsWith('capabilit'));
  const execution = result as { readonly status?: string; readonly runId?: string; readonly correlationId?: string; readonly error?: unknown; readonly output?: { readonly payload?: Record<string, unknown> } };
  const payload = execution.output?.payload;
  audit({
    ts: new Date().toISOString(),
    cmd: command,
    args,
    capabilityId,
    runId: execution.runId,
    correlationId: execution.correlationId,
    status: execution.status,
    exitCode: commandSucceeded && (execution.status === undefined || execution.status === 'succeeded') ? 0 : 1,
    durationMs: Date.now() - started,
    metrics: capabilityId === 'graph.sync' && payload === undefined ? undefined : capabilityId === 'graph.sync' ? { documents: payload?.documents, indexed: payload?.indexed, skipped: payload?.skipped, nodes: payload?.nodes, edges: payload?.edges, durationMs: payload?.durationMs, files: payload?.files } : undefined,
  });
  return commandSucceeded && (execution.status === undefined || execution.status === 'succeeded') ? 0 : 1;
}

async function runMcpStdio(): Promise<number> {
  const runtime = createCliCapabilityRuntime(runLegacyCaptured, createGraphSyncComposition());
  const definitions = runtime.registry.list();
  const mcp = new McpServer({
    registry: runtime.registry,
    policy: runtime.policy,
    agent: {
      ...runtime.agent,
      permissions: ['read', 'write', 'execution', 'database'],
      capabilities: definitions.map((definition) => definition.id),
    },
    audit: {
      append: (event) => audit({ ts: new Date().toISOString(), cmd: `mcp:${event.tool}`, args: [], capabilityId: event.tool, correlationId: event.correlationId, status: event.outcome === 'success' ? 'succeeded' : event.outcome === 'blocked' ? 'blocked' : 'failed', exitCode: event.outcome === 'success' ? 0 : 1, durationMs: 0 }),
    },
  });
  process.stdin.setEncoding('utf8');
  const handleLine = async (line: string): Promise<void> => {
    if (line.trim().length === 0) return;
    let request: { readonly id?: string | number; readonly method?: string; readonly params?: Record<string, unknown> };
    try {
      request = JSON.parse(line) as { readonly id?: string | number; readonly method?: string; readonly params?: Record<string, unknown> };
      const id = request.id ?? null;
      let result: unknown;
      if (request.method === 'initialize') result = { protocolVersion: '2025-06-18', capabilities: { tools: {}, resources: {} }, serverInfo: { name: 'forja', version: '2.0.1' } };
      else if (request.method === 'tools/list') result = { tools: mcp.listTools() };
      else if (request.method === 'resources/list') result = { resources: mcp.listResources() };
      else if (request.method === 'tools/call') result = await mcp.callTool(String(request.params?.name ?? ''), request.params?.arguments ?? {});
      else if (request.method === 'resources/read') result = await mcp.readResource(String(request.params?.uri ?? ''));
      else throw new Error(`Unsupported MCP method: ${request.method ?? 'missing'}`);
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
    } catch (error) {
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message: error instanceof Error ? error.message : 'MCP request failed' } })}\n`);
    }
  };
  let buffer = '';
  for await (const chunk of process.stdin) {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) await handleLine(line);
  }
  await handleLine(buffer);
  return 0;
}

function createGraphSyncComposition(): GraphSyncComposition {
  fs.mkdirSync(getWorkspaceDbDir(), { recursive: true });
  const database = new Database(process.env.FORJA_RUNTIME_DB ?? getWorkspaceDbPath());
  new SqliteMigrationRunner(database).apply();
  const graphRoot = process.env.FORJA_GRAPH_ROOT ?? process.cwd();
  return { graph: new GraphLoop(new SqliteGraphStore(database)), source: new GitGraphDocumentSource(graphRoot, new SpawnCommandRunner()) };
}

const [name, ...rest] = process.argv.slice(2);

if (!name || name === 'help' || name === '--help' || name === '-h') {
  printHelp();
  process.exit(0);
}

if (name === 'capabilities:list' || name === 'capabilities:describe' || name === 'capability:execute') {
  process.exit(await runCapabilityCommand(name, rest));
}

if (name === 'mcp:start') {
  process.exit(await runMcpStdio());
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

if (capabilityIdForCommand(name) !== undefined) {
  process.exit(await runCapabilityCommand(name, rest));
}

const started = Date.now();
let result;
// Os filhos rodam ONDE O USUÁRIO INVOCOU, não na raiz do pacote. `cwd: root` funcionava por
// coincidência no repo do framework (invoca-se da raiz), mas no pacote instalado `root` é
// `node_modules/forjajs/dist` — e comandos que operam no projeto do usuário (spec:new) escreviam
// DENTRO do pacote (bug da v1.6.1). Scripts do framework não dependem de cwd: resolvem seus paths
// por __dirname (repo) ou pelo workspace (absoluto).
if (cmd.node) {
  const script = resolveScript(root, cmd.node);
  result = spawnSync('node', [script, ...(cmd.args || []), ...rest], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
} else {
  result = spawnSync(cmd.bin, [...(cmd.args || []), ...rest], {
    cwd: process.cwd(),
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
