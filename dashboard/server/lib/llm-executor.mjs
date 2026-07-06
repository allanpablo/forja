import { spawn } from 'node:child_process';

export function buildExecSpec(assignment, prompt) {
  const provider = assignment?.provider;
  const model = assignment?.model;
  const base = String(assignment?.command || '').trim();
  if (!provider || provider === 'manual') {
    const err = new Error('provider not executable');
    err.code = 'PROVIDER_NOT_EXECUTABLE';
    throw err;
  }

  if (provider === 'codex') {
    const parts = base ? base.split(/\s+/) : ['codex'];
    return {
      cmd: parts[0],
      args: ['exec', ...parts.slice(1), ...(model ? ['--model', model] : []), '--sandbox', 'workspace-write', '--ask-for-approval', 'never', prompt],
    };
  }
  if (provider === 'claude') {
    const parts = base ? base.split(/\s+/) : ['claude'];
    return { cmd: parts[0], args: [...parts.slice(1), prompt] };
  }
  if (provider === 'gemini-cli') {
    const parts = base ? base.split(/\s+/) : ['gemini'];
    return {
      cmd: parts[0],
      args: [...parts.slice(1), ...(model ? ['-m', model] : []), '-p', prompt],
    };
  }
  if (provider === 'copilot') {
    return { cmd: 'gh', args: ['copilot', 'suggest', '-t', 'shell', prompt] };
  }
  if (provider === 'ollama') {
    const parts = base ? base.split(/\s+/) : ['ollama'];
    return { cmd: parts[0], args: [...parts.slice(1), 'run', model || 'llama3.3', prompt] };
  }

  const parts = base.split(/\s+/).filter(Boolean);
  if (!parts.length) {
    const err = new Error('missing executable command');
    err.code = 'COMMAND_MISSING';
    throw err;
  }
  return { cmd: parts[0], args: [...parts.slice(1), prompt] };
}

export function spawnLlm(assignment, prompt, opts = {}) {
  const spec = buildExecSpec(assignment, prompt);
  const proc = spawn(spec.cmd, spec.args, {
    cwd: opts.cwd,
    env: { ...process.env, ...(opts.env || {}) },
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout.setEncoding('utf8');
  proc.stderr.setEncoding('utf8');
  const done = new Promise(resolve => {
    let spawnError = null;
    proc.on('error', err => {
      spawnError = err;
      resolve({ code: -1, signal: null, error: err.message, spawnError: true });
    });
    proc.on('close', (code, signal) => {
      if (!spawnError) resolve({ code, signal });
    });
  });
  return { ...spec, proc, stdout: proc.stdout, stderr: proc.stderr, done };
}
