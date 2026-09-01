/**
 * @forja/engineering-provenance — AI Code Provenance (SPEC-039).
 *
 * Domínio puro: `extractProvenance` mapeia um `RuntimeRun` já persistido (`packages/contracts`,
 * `changedFiles`+`agent` já existentes) para `ProvenanceRecord[]` — um por arquivo. Nenhum `fs`/
 * rede/SQLite aqui; a persistência (`SqliteProvenanceStore`) e a leitura do `RuntimeRun` vivem em
 * `scripts/provenance.ts`.
 *
 * Granularidade é **arquivo**, não linha (AC-2, `ProvenanceRecord.lines` sempre `undefined` nesta
 * spec) — nenhuma fonte de dado real deste repositório rastreia hunks de linha por run hoje, e
 * fingir essa granularidade seria inventar precisão que os dados não sustentam.
 */

import type { RuntimeRun } from '../../../contracts/src/index.ts';

export interface ProvenanceRecord {
  readonly file: string;
  readonly runId: string;
  readonly agentId: string;
  readonly agentName: string;
  /** Sempre `undefined` — `AgentIdentity` (o tipo de `RuntimeRun.agent`) não carrega um campo de modelo de LLM hoje. Presente no tipo para não quebrar quando uma fonte real desse dado existir. */
  readonly model?: string;
  /** Sempre `undefined` nesta spec — ver nota no topo do arquivo. Presente no tipo pela mesma razão de `model`. */
  readonly lines?: readonly [number, number][];
  readonly recordedAt: string;
}

export function extractProvenance(run: RuntimeRun): readonly ProvenanceRecord[] {
  return run.changedFiles.map((file) => ({
    file,
    runId: run.runId,
    agentId: run.agent.id,
    agentName: run.agent.name,
    recordedAt: run.updatedAt,
  }));
}
