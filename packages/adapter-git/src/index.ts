import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { DeterministicDocument, GraphDocumentSource } from '../../graph/src/index.ts';
import { graphDocumentId } from '../../graph/src/index.ts';
import { isPathWithinRoot, type ISO8601 } from '../../contracts/src/index.ts';
import type { SandboxBackend, SandboxCommandResult, SandboxDiffData, SandboxValidation } from '../../sandbox/src/index.ts';
import type { SandboxCommand, SandboxSession } from '../../contracts/src/index.ts';

export interface CommandRunner {
  run(command: SandboxCommand): SandboxCommandResult | Promise<SandboxCommandResult>;
}

export class SpawnCommandRunner implements CommandRunner {
  run(command: SandboxCommand): SandboxCommandResult {
    const started = Date.now();
    const result = spawnSync(command.executable, [...command.args], { cwd: command.cwd, env: sandboxEnvironment(command.env), encoding: 'utf8' });
    return { exitCode: result.status ?? 1, stdout: result.stdout ?? '', stderr: [result.stderr ?? '', result.error?.message ?? ''].filter(Boolean).join('\n'), durationMs: Date.now() - started };
  }
}

export class GitGraphDocumentSource implements GraphDocumentSource {
  private readonly root: string;
  private readonly runner: CommandRunner;
  private readonly capturedAt: () => ISO8601;

  constructor(root: string, runner: CommandRunner, capturedAt: () => ISO8601 = () => new Date().toISOString() as ISO8601) {
    this.root = path.resolve(root);
    this.runner = runner;
    this.capturedAt = capturedAt;
  }

  async listDocuments(): Promise<readonly DeterministicDocument[]> {
    const result = await this.runner.run({ executable: 'git', args: ['-C', this.root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'] });
    if (result.exitCode !== 0) throw new Error(`Git file listing failed: ${result.stderr}`);
    const documents: DeterministicDocument[] = [];
    for (const relative of result.stdout.split('\0').map((item) => item.trim()).filter(Boolean)) {
      if (!isIndexable(relative)) continue;
      const absolute = path.join(this.root, relative);
      if (!isPathWithinRoot(this.root, absolute)) continue;
      try {
        const content = fs.readFileSync(absolute, 'utf8');
        if (content.includes('\0') || Buffer.byteLength(content, 'utf8') > 1_000_000) continue;
        documents.push({ nodeId: graphDocumentId(relative), locator: relative, content, capturedAt: this.capturedAt() });
      } catch { /* unreadable/deleted files are skipped and remain auditable in Git status */ }
    }
    return documents;
  }
}

function isIndexable(relative: string): boolean {
  if (relative.split('/').some((part) => part === 'node_modules' || part === '.git' || part === 'dist' || part === 'coverage')) return false;
  return /\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|yaml|yml)$/.test(relative);
}

/**
 * `HOME`/`USERPROFILE` (SPEC-038 achado real): sem eles, `npm` não consegue resolver seu diretório
 * de config/cache e trava indefinidamente em vez de falhar rápido — reproduzido rodando
 * `forja simulate` com `--command "npm test"` contra este próprio repositório. Nenhum dos dois é
 * segredo (são só um path de diretório), então passá-los adiante não viola o teste
 * "runner não herda secrets do ambiente por padrão" (`test/adapter-git.test.js`) — esse teste
 * cobre uma env var arbitrária do processo host, não este allowlist fixo.
 */
function sandboxEnvironment(overrides?: Readonly<Record<string, string>>): NodeJS.ProcessEnv {
  const inherited = {} as NodeJS.ProcessEnv;
  for (const key of ['PATH', 'NODE_PATH', 'SystemRoot', 'TMPDIR', 'TMP', 'TEMP', 'HOME', 'USERPROFILE']) {
    const value = process.env[key];
    if (value !== undefined) inherited[key] = value;
  }
  return { ...inherited, ...(overrides ?? {}) };
}

export interface PatchApplier {
  apply(root: string, patch: string): void | Promise<void>;
  revert(root: string, patch: string): void | Promise<void>;
}

export interface GitWorktreeOptions {
  readonly repositoryRoot: string;
  readonly sourceRef: string;
  readonly patchApplier: PatchApplier;
}

export class GitWorktreeBackend implements SandboxBackend {
  private readonly runner: CommandRunner;
  private readonly options: GitWorktreeOptions;

  constructor(runner: CommandRunner, options: GitWorktreeOptions) { this.runner = runner; this.options = options; }

  async create(session: SandboxSession): Promise<void> {
    await this.runGit(['-C', this.options.repositoryRoot, 'worktree', 'add', '--detach', session.root, this.options.sourceRef]);
  }

  async prepare(session: SandboxSession): Promise<void> {
    const result = await this.runGit(['-C', session.root, 'status', '--porcelain']);
    if (result.exitCode !== 0) throw new Error(`Git worktree preparation failed: ${result.stderr}`);
  }

  async execute(session: SandboxSession, command: SandboxCommand): Promise<SandboxCommandResult> {
    return this.runner.run({ ...command, cwd: session.root });
  }

  async validate(session: SandboxSession): Promise<SandboxValidation> {
    const result = await this.runGit(['-C', session.root, 'diff', '--check']);
    return { status: result.exitCode === 0 ? 'accepted' : 'rejected', evidenceIds: [], summary: result.exitCode === 0 ? 'git diff --check passed' : `git diff --check failed: ${result.stderr}` };
  }

  async diff(session: SandboxSession): Promise<SandboxDiffData> {
    const [names, stats] = await Promise.all([
      this.runGit(['-C', session.root, 'diff', '--name-only']),
      this.runGit(['-C', session.root, 'diff', '--numstat']),
    ]);
    if (names.exitCode !== 0 || stats.exitCode !== 0) throw new Error(`Git diff failed: ${names.stderr || stats.stderr}`);
    let additions = 0;
    let deletions = 0;
    for (const line of stats.stdout.split('\n').map((item) => item.trim()).filter(Boolean)) {
      const [added, removed] = line.split('\t');
      if (added !== '-' && Number.isInteger(Number(added))) additions += Number(added);
      if (removed !== '-' && Number.isInteger(Number(removed))) deletions += Number(removed);
    }
    return { files: names.stdout.split('\n').map((item) => item.trim()).filter(Boolean), additions, deletions, evidenceIds: [] };
  }

  async promote(session: SandboxSession): Promise<void> {
    const patch = await this.runGit(['-C', session.root, 'diff', '--binary']);
    if (patch.exitCode !== 0) throw new Error(`Git promotion diff failed: ${patch.stderr}`);
    await this.options.patchApplier.apply(this.options.repositoryRoot, patch.stdout);
  }

  async rollback(session: SandboxSession): Promise<void> {
    const patch = await this.runGit(['-C', session.root, 'diff', '--binary']);
    if (patch.exitCode !== 0) throw new Error(`Git rollback diff failed: ${patch.stderr}`);
    await this.options.patchApplier.revert(this.options.repositoryRoot, patch.stdout);
  }

  async reject(session: SandboxSession): Promise<void> {
    await this.runGit(['-C', this.options.repositoryRoot, 'worktree', 'remove', '--force', session.root]);
  }

  async destroy(session: SandboxSession): Promise<void> {
    await this.runGit(['-C', this.options.repositoryRoot, 'worktree', 'remove', '--force', session.root]);
  }

  private async runGit(args: readonly string[]): Promise<SandboxCommandResult> {
    return this.runner.run({ executable: 'git', args });
  }
}
