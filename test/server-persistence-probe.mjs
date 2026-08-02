import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { CapabilityRegistry } from '../packages/core/src/index.ts';
import { EventBus } from '../packages/events/src/index.ts';
import { GraphLoop } from '../packages/graph/src/index.ts';
import { ApprovalLedger, PolicyEngine } from '../packages/policy/src/index.ts';
import { InMemoryEventStream } from '../packages/adapter-nest/src/index.ts';
import { createDefaultControlPlane } from '../apps/server/src/main.ts';
import { SqliteApprovalStore, SqliteContextCache, SqliteEventStore, SqliteGraphStore, SqliteMigrationRunner, SqliteObservationStore, SqliteOrchestrationStore, SqliteRuntimePersistence } from '../packages/adapter-sqlite/src/index.ts';

const agent = { id: 'server-persistence-agent', name: 'Persistence test agent', role: 'developer', autonomy: 'supervised' };
const definition = { schemaVersion: '2.0', createdAt: '2026-08-02T00:00:00.000Z', updatedAt: '2026-08-02T00:00:00.000Z', correlationId: 'server-persistence', id: 'server.persistence.read', version: '1.0.0', description: 'Deterministic persistence probe', permissions: ['read'], risk: 'low', sideEffects: [], requirements: [], supportsAutonomy: true, idempotent: true, timeoutMs: 1000, retry: { maxAttempts: 1, backoffMs: 0 }, aliases: [] };

function makeRegistry() {
  const value = new CapabilityRegistry();
  value.register({ definition, validateInput: (input) => input ?? {}, validateOutput: (output) => output, handler: async () => ({ capabilityId: definition.id, payload: { ok: true }, evidence: [{ id: 'server-persistence-evidence', source: 'server-persistence-test', locator: 'handler', capturedAt: '2026-08-02T00:00:00.000Z', status: 'verified' }] }) });
  return value;
}

function makePolicy(database) {
  return new PolicyEngine({ approvalLedger: new ApprovalLedger(new SqliteApprovalStore(database)), rules: [{ id: 'server-persistence-approval', priority: 10, effect: 'REQUIRE_APPROVAL', reason: 'Persistence probe requires approval', scope: {} }] });
}

function makeControlPlane(database, value, policy) {
  const graph = new GraphLoop(new SqliteGraphStore(database));
  const events = new EventBus(new SqliteEventStore(database));
  return createDefaultControlPlane(new InMemoryEventStream(), value, policy, new SqliteRuntimePersistence(database), new ApprovalLedger(new SqliteApprovalStore(database)), events, graph, undefined, new SqliteOrchestrationStore(database), new SqliteObservationStore(database));
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-server-persistence-'));
const dbPath = path.join(root, 'runtime.db');
try {
  const firstDatabase = new Database(dbPath);
  new SqliteMigrationRunner(firstDatabase).apply();
  const firstControlPlane = makeControlPlane(firstDatabase, makeRegistry(), makePolicy(firstDatabase));
  const budget = { inputTokens: 40, outputTokens: 20, totalTokens: 60, usedTokens: 0 };
  const started = await firstControlPlane.runtimeStart({ objective: 'restart persistence probe', agent, budget, steps: [{ capabilityId: definition.id, payload: {}, estimatedTokens: 10, categories: ['read'], environment: 'local', files: [], approval: { action: 'read.probe', justification: 'Prove approval persistence', impact: 'No files changed', expiresAt: '2099-01-01T00:00:00.000Z' } }] });
  const awaiting = await firstControlPlane.runtimeExecute(started.runId);
  const pending = await firstControlPlane.approvalList();
  const graph = new GraphLoop(new SqliteGraphStore(firstDatabase));
  graph.upsertNode({ id: 'restart-node', type: 'Task', label: 'restart persistence probe', status: 'verified' });
  new SqliteContextCache(firstDatabase).set('restart-context', 'evidence context');
  await new EventBus(new SqliteEventStore(firstDatabase)).append({ type: 'approval.requested', aggregateId: started.runId, payload: { approvalId: pending[0].id }, idempotencyKey: `approval:${pending[0].id}` });
  await firstControlPlane.record({ traceId: 'restart-observation', runId: started.runId, outcome: 'blocked', contextRefs: ['restart-context'] });
  await new Promise((resolve) => setTimeout(resolve, 25));
  firstDatabase.close();

  const secondDatabase = new Database(dbPath);
  const secondControlPlane = makeControlPlane(secondDatabase, makeRegistry(), makePolicy(secondDatabase));
  const recovered = await secondControlPlane.runtimeGet(started.runId);
  const result = { ok: recovered.runId === started.runId && awaiting.state === 'awaiting_approval', state: recovered.state, approvals: (await secondControlPlane.approvalList()).length, context: new SqliteContextCache(secondDatabase).get('restart-context'), graphNodes: new GraphLoop(new SqliteGraphStore(secondDatabase)).query({ labelIncludes: 'restart persistence' }).length, events: (await new EventBus(new SqliteEventStore(secondDatabase)).list()).length, observations: (await secondControlPlane.observations()).length };
  secondDatabase.close();
  console.log(JSON.stringify(result));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
