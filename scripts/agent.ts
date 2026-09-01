#!/usr/bin/env node
/**
 * agent:register / :list / :show / :score / :history / :recommend (SPEC-036, SPEC-037)
 *
 *   forja agent:register <id> --role <role> [--provider <p>] [--model <m>]
 *                              [--capabilities <c1,c2>] [--domains <d1,d2>]
 *                              [--max-files <n>] [--max-cost-usd <n>]
 *   forja agent:list                      todos os agentes registrados, com trustLevel se já pontuado
 *   forja agent:show <id>                 detalhe de um agente
 *   forja agent:score <id> [--domain <d>] computa e persiste trustLevel/autonomyLevel via Observation reais
 *   forja agent:history <id>              Observations do agente, mais recentes primeiro
 *   forja agent:recommend --role <role> [--domain <d>]  ranking de agentes registrados por
 *                                        adequação — informação, não atribuição (SPEC-037 AC-4)
 *
 * `packages/engineering/identity` faz o cálculo puro (computeReputationScore, recommendAgent);
 * este script busca `Observation`s reais (`SqliteObservationStore`, já existente), monta o
 * `EvaluationReport` via `EvaluationEngine` (`packages/evals`, já existente — nenhuma métrica
 * reimplementada aqui) e persiste `AgentProfile2` (`SqliteAgentProfileStore`, sem migration nova —
 * D3 do plan de SPEC-036). `agent:register` deliberadamente não tem flag de
 * trust-level/autonomy-level — só `agent:score` escreve esses campos (D2 do plan, AC-1/AC-3 de
 * SPEC-036).
 */

import fs from 'node:fs';
import Database from 'better-sqlite3';
import { computeReputationScore, recommendAgent } from '../packages/engineering/identity/src/index.ts';
import { EvaluationEngine } from '../packages/evals/src/index.ts';
import { SqliteAgentProfileStore, SqliteMigrationRunner, SqliteObservationStore } from '../packages/adapter-sqlite/src/index.ts';
import { getWorkspaceDbDir, getWorkspaceDbPath } from '../lib/workspace.ts';
import type { AgentProfile2, EntityId, ISO8601 } from '../packages/contracts/src/index.ts';

function flag(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function list(value: string | undefined): readonly string[] {
  return value === undefined ? [] : value.split(',').map((item) => item.trim()).filter((item) => item.length > 0);
}

function openDatabase() {
  fs.mkdirSync(getWorkspaceDbDir(), { recursive: true });
  const database = new Database(process.env.FORJA_RUNTIME_DB ?? getWorkspaceDbPath());
  new SqliteMigrationRunner(database).apply();
  return database;
}

function cmdRegister(args: string[]): void {
  const [id] = args;
  const role = flag(args, '--role');
  if (!id || !role) { console.error('Uso: forja agent:register <id> --role <role> [--provider <p>] [--model <m>] [--capabilities <c1,c2>] [--domains <d1,d2>] [--max-files <n>] [--max-cost-usd <n>]'); process.exitCode = 1; return; }

  const database = openDatabase();
  try {
    const store = new SqliteAgentProfileStore(database);
    const existing = store.get(id as EntityId);
    const now = new Date().toISOString() as ISO8601;
    const maxFiles = flag(args, '--max-files');
    const maxCostUsd = flag(args, '--max-cost-usd');
    const limits = maxFiles === undefined && maxCostUsd === undefined ? undefined : {
      ...(maxFiles === undefined ? {} : { maxFiles: Number(maxFiles) }),
      ...(maxCostUsd === undefined ? {} : { maxCostUsd: Number(maxCostUsd) }),
    };
    const profile: AgentProfile2 = {
      schemaVersion: '2.0', createdAt: existing?.createdAt ?? now, updatedAt: now, correlationId: `agent:${id}`,
      id: id as EntityId, role,
      provider: flag(args, '--provider'), model: flag(args, '--model'),
      capabilities: list(flag(args, '--capabilities')), architectureDomains: list(flag(args, '--domains')),
      limits,
      // trustLevel/autonomyLevel/lastScoredAt: nunca setados aqui (D2) — preserva o que já existia
      // (registrar de novo não deve apagar a última pontuação).
      trustLevel: existing?.trustLevel, autonomyLevel: existing?.autonomyLevel, lastScoredAt: existing?.lastScoredAt,
    };
    store.save(profile);
    console.log(`${existing === undefined ? 'Registrado' : 'Atualizado'}: ${id} (role: ${role})`);
  } finally {
    database.close();
  }
}

function cmdList(): void {
  const database = openDatabase();
  try {
    const profiles = new SqliteAgentProfileStore(database).list();
    if (profiles.length === 0) { console.log('Nenhum agente registrado — rode `forja agent:register <id> --role <role>` primeiro.'); return; }
    for (const profile of profiles) {
      const trust = profile.trustLevel === undefined ? '(sem pontuação — rode agent:score)' : `trustLevel ${profile.trustLevel}/5 (${profile.autonomyLevel})`;
      console.log(`${profile.id}  role:${profile.role}  ${trust}`);
    }
  } finally {
    database.close();
  }
}

function cmdShow([id]: string[]): void {
  if (!id) { console.error('Uso: forja agent:show <id>'); process.exitCode = 1; return; }
  const database = openDatabase();
  try {
    const profile = new SqliteAgentProfileStore(database).get(id as EntityId);
    if (profile === undefined) { console.error(`Agente não encontrado: ${id}. Rode forja agent:register primeiro.`); process.exitCode = 1; return; }
    console.log(JSON.stringify(profile, null, 2));
  } finally {
    database.close();
  }
}

async function cmdScore(args: string[]): Promise<void> {
  const [id] = args;
  const domain = flag(args, '--domain');
  if (!id) { console.error('Uso: forja agent:score <id> [--domain <d>]'); process.exitCode = 1; return; }

  const database = openDatabase();
  try {
    const profileStore = new SqliteAgentProfileStore(database);
    const profile = profileStore.get(id as EntityId);
    if (profile === undefined) { console.error(`Agente não encontrado: ${id}. Rode forja agent:register primeiro.`); process.exitCode = 1; return; }

    const observations = new SqliteObservationStore(database).list().filter((observation) => observation.agentId === id && (domain === undefined || observation.capabilityId === domain));
    const engine = new EvaluationEngine({ list: () => observations });
    const report = await engine.evaluate({ scope: 'agent', scopeId: id, observations });
    const score = computeReputationScore(report, { agentId: id, domain });

    const now = new Date().toISOString() as ISO8601;
    profileStore.save({ ...profile, trustLevel: score.trustLevel, autonomyLevel: score.autonomyLevel, lastScoredAt: now, updatedAt: now });

    console.log(`${id}${domain === undefined ? '' : ` (domain: ${domain})`} — trustLevel ${score.trustLevel}/5 → ${score.autonomyLevel}`);
    console.log(`confidence ${(score.confidence * 100).toFixed(0)}% (amostra: ${score.sampleSize} observation(s))`);
    for (const [name, value] of Object.entries(score.metrics)) console.log(`  ${name}: ${value}`);
    if (score.sampleSize === 0) console.log('\nSem Observation ainda para este agente — score é o piso conservador (cold start, AC-3).');
  } finally {
    database.close();
  }
}

function cmdHistory([id]: string[]): void {
  if (!id) { console.error('Uso: forja agent:history <id>'); process.exitCode = 1; return; }
  const database = openDatabase();
  try {
    const observations = new SqliteObservationStore(database).list().filter((observation) => observation.agentId === id).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    if (observations.length === 0) { console.log(`Nenhuma Observation para ${id} ainda.`); return; }
    for (const observation of observations) console.log(`${observation.createdAt}  ${observation.outcome.padEnd(12)} ${observation.capabilityId ?? '(sem capability)'}  ${observation.id}`);
  } finally {
    database.close();
  }
}

function cmdRecommend(args: string[]): void {
  const role = flag(args, '--role');
  const domain = flag(args, '--domain');
  if (!role) { console.error('Uso: forja agent:recommend --role <role> [--domain <d>]'); process.exitCode = 1; return; }

  const database = openDatabase();
  try {
    const profiles = new SqliteAgentProfileStore(database).list();
    if (profiles.length === 0) { console.log('Nenhum agente registrado — rode `forja agent:register <id> --role <role>` primeiro.'); return; }
    const ranking = recommendAgent(profiles, { role, domain });
    for (const item of ranking) console.log(`${item.agentId}  score:${item.score}  ${item.reasons.join(', ')}`);
    console.log('\n(informação, não atribuição — a escolha final continua manual/do orquestrador, SPEC-037 AC-4)');
  } finally {
    database.close();
  }
}

async function main(): Promise<void> {
  const [subcommand, ...rest] = process.argv.slice(2);
  switch (subcommand) {
    case 'register': return cmdRegister(rest);
    case 'list': return cmdList();
    case 'show': return cmdShow(rest);
    case 'score': return cmdScore(rest);
    case 'history': return cmdHistory(rest);
    case 'recommend': return cmdRecommend(rest);
    default:
      console.error('Uso: forja agent:<register|list|show|score|history|recommend> [args]');
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`\nagent: falhou: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
