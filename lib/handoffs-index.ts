/**
 * lib/handoffs-index.ts — handoffs em aberto do universal.db (SPEC-044).
 *
 * Extraído de `scripts/hook-session-start.ts`. Import de SQLite é dinâmico e dentro de try/catch
 * de propósito (ADR-0021): sem `node_modules`, sem banco ou com ABI quebrado, degrada para `[]`
 * em vez de derrubar quem chama. Somente leitura.
 */

export interface OpenHandoff {
  readonly id: number;
  readonly from: string;
  readonly to: string;
  readonly intent: string;
  readonly slug: string;
}

/**
 * Handoffs `status='open'`, mais recentes primeiro (até `limit`). Nunca lança — `[]` em qualquer falha.
 * Com `project`, só os carimbados com esse projeto (payload `project`, gravado pelo agent:route).
 */
export async function openHandoffs(limit = 10, project: string | null = null): Promise<OpenHandoff[]> {
  try {
    const { getWorkspaceDbPath } = await import('./workspace.ts');
    const { default: Database } = await import('better-sqlite3');
    const db = new Database(getWorkspaceDbPath(), { readonly: true });
    const rows = db
      .prepare(
        `SELECT id, from_agent, to_agent, intent, spec_slug FROM handoffs WHERE status='open'
         ${project ? "AND json_extract(payload_json, '$.project') = ?" : ''} ORDER BY id DESC LIMIT ?`,
      )
      .all(...(project ? [project, limit] : [limit])) as {
      id: number;
      from_agent: string;
      to_agent: string;
      intent: string;
      spec_slug: string | null;
    }[];
    db.close();
    return rows.map((r) => ({
      id: r.id,
      from: r.from_agent,
      to: r.to_agent,
      intent: r.intent,
      slug: r.spec_slug ?? '',
    }));
  } catch {
    return [];
  }
}

export interface OrphanHandoff {
  readonly id: number;
  readonly project: string | null;
  readonly reason: 'sem-projeto' | 'projeto-inexistente';
}

/**
 * Handoffs abertos que ninguém vai ver: sem carimbo de projeto (pré-v5) ou carimbados com um
 * projeto que não existe mais no workspace. Foi assim que um handoff de produto apagado ficou meses
 * aparecendo no briefing do framework. Nunca lança.
 */
export async function orphanHandoffs(knownProjects: readonly string[]): Promise<OrphanHandoff[]> {
  try {
    const { getWorkspaceDbPath } = await import('./workspace.ts');
    const { default: Database } = await import('better-sqlite3');
    const db = new Database(getWorkspaceDbPath(), { readonly: true });
    const rows = db
      .prepare(`SELECT id, json_extract(payload_json, '$.project') AS project FROM handoffs WHERE status IN ('open','in_progress') ORDER BY id`)
      .all() as { id: number; project: string | null }[];
    db.close();
    const known = new Set(['forja', ...knownProjects]);
    return rows
      .filter((r) => !r.project || !known.has(r.project))
      .map((r) => ({ id: r.id, project: r.project, reason: r.project ? 'projeto-inexistente' : 'sem-projeto' }));
  } catch {
    return [];
  }
}
