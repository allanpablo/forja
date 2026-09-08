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

/** Handoffs `status='open'`, mais recentes primeiro (até `limit`). Nunca lança — `[]` em qualquer falha. */
export async function openHandoffs(limit = 10): Promise<OpenHandoff[]> {
  try {
    const { getWorkspaceDbPath } = await import('./workspace.ts');
    const { default: Database } = await import('better-sqlite3');
    const db = new Database(getWorkspaceDbPath(), { readonly: true });
    const rows = db
      .prepare(
        `SELECT id, from_agent, to_agent, intent, spec_slug FROM handoffs WHERE status='open' ORDER BY id DESC LIMIT ?`,
      )
      .all(limit) as {
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
