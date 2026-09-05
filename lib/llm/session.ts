import fs from 'node:fs';
import { createHash } from 'node:crypto';
import type { LlmProfile } from '../../packages/llm/src/index.ts';
import type { SqliteJsonRepository } from '../../packages/adapter-sqlite/src/index.ts';

export interface LlmSession {
  readonly id: string;
  readonly cwd: string;
  readonly profileHash: string;
  readonly observationId: string;
  readonly updatedAt: string;
}

export function profileFingerprint(profile: LlmProfile): string {
  return createHash('sha256').update(JSON.stringify({ provider: profile.provider, model: profile.model,
    command: profile.command, commandArgs: profile.commandArgs ?? [], privacy: profile.privacy })).digest('hex');
}

export class LlmSessionStore {
  private readonly repository: SqliteJsonRepository;
  constructor(repository: SqliteJsonRepository) { this.repository = repository; }

  require(id: string, profile: LlmProfile, cwd: string): LlmSession {
    if (profile.provider !== 'codex' || !validSessionId(id)) throw new Error('Retomada exige Codex e ID explícito válido.');
    const session = this.repository.get<LlmSession>('llm_session', id);
    if (!session) throw new Error('Sessão não registrada neste workspace Forja.');
    this.assertBinding(session, profile, cwd);
    return session;
  }

  save(id: string, profile: LlmProfile, cwd: string, observationId: string): void {
    if (!validSessionId(id)) throw new Error('ID de sessão inválido retornado pelo provedor.');
    const previous = this.repository.get<LlmSession>('llm_session', id);
    if (previous) this.assertBinding(previous, profile, cwd);
    const session: LlmSession = { id, cwd: fs.realpathSync(cwd), profileHash: profileFingerprint(profile), observationId, updatedAt: new Date().toISOString() };
    this.repository.put('llm_session', id, session, session.updatedAt);
  }

  private assertBinding(session: LlmSession, profile: LlmProfile, cwd: string): void {
    if (session.cwd !== fs.realpathSync(cwd) || session.profileHash !== profileFingerprint(profile)) {
      throw new Error('Sessão pertence a outro projeto ou configuração de perfil.');
    }
  }
}

export function validSessionId(id: string): boolean { return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id); }
