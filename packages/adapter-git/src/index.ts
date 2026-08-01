import type { SandboxBackend, SandboxCommandResult, SandboxDiffData, SandboxValidation } from '../../sandbox/src/index.ts';
import type { SandboxCommand, SandboxSession } from '../../contracts/src/index.ts';

export interface CommandRunner {
  run(command: SandboxCommand): SandboxCommandResult | Promise<SandboxCommandResult>;
}

export interface PatchApplier {
  apply(root: string, patch: string): void | Promise<void>;
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
