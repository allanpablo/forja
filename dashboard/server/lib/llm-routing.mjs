import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const PROVIDERS = Object.freeze([
  {
    id: 'codex',
    label: 'Codex',
    command: 'codex',
    auth: 'local',
    models: ['gpt-5.2', 'gpt-5.3-codex', 'gpt-5.4', 'gpt-5.5'],
  },
  {
    id: 'claude',
    label: 'Claude Code',
    command: 'claude',
    auth: 'local',
    models: ['sonnet', 'opus'],
  },
  {
    id: 'gemini-cli',
    label: 'Gemini CLI',
    command: 'gemini',
    auth: 'local',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash'],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    command: 'deepseek',
    auth: 'external',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    command: 'minimax',
    auth: 'external',
    models: ['MiniMax-M1', 'MiniMax-Text-01'],
  },
  {
    id: 'mistral',
    label: 'Mistral AI',
    command: 'mistral',
    auth: 'external',
    models: ['mistral-large-latest', 'codestral-latest'],
  },
  {
    id: 'qwen',
    label: 'Qwen',
    command: 'qwen',
    auth: 'external',
    models: ['qwen-max', 'qwen-plus', 'qwen-coder-plus'],
  },
  {
    id: 'ollama',
    label: 'Ollama',
    command: 'ollama',
    auth: 'local',
    models: ['llama3.3', 'qwen2.5-coder', 'deepseek-r1'],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    command: 'openrouter',
    auth: 'external',
    models: ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet', 'deepseek/deepseek-chat'],
  },
  {
    id: 'together',
    label: 'Together AI',
    command: 'together',
    auth: 'external',
    models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-Coder-32B-Instruct'],
  },
  {
    id: 'groq',
    label: 'Groq',
    command: 'groq',
    auth: 'external',
    models: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
  },
  {
    id: 'xai',
    label: 'xAI',
    command: 'xai',
    auth: 'external',
    models: ['grok-2-latest', 'grok-code-fast-1'],
  },
  {
    id: 'cohere',
    label: 'Cohere',
    command: 'cohere',
    auth: 'external',
    models: ['command-r-plus', 'command-r'],
  },
  {
    id: 'perplexity',
    label: 'Perplexity',
    command: 'pplx',
    auth: 'external',
    models: ['sonar-pro', 'sonar'],
  },
  {
    id: 'manual',
    label: 'Manual',
    command: '',
    auth: 'external',
    models: ['manual'],
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot CLI',
    command: 'gh copilot',
    auth: 'local',
    models: ['default'],
  },
]);

const VERSION = 1;

export function routingPath(repoRoot) {
  return path.join(workspaceRoot(), '.context', 'llm-profiles.json');
}

export function defaultRouting() {
  return {
    version: VERSION,
    assignments: {},
  };
}

export function readRouting(repoRoot) {
  const file = routingPath(repoRoot);
  if (!fs.existsSync(file)) return defaultRouting();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed.version !== 1 || !parsed.profiles || typeof parsed.profiles !== 'object') return defaultRouting();
    const assignments = {};
    for (const [name, profile] of Object.entries(parsed.profiles)) {
      if (!profile || typeof profile !== 'object' || !Array.isArray(profile.roles)) continue;
      for (const role of profile.roles) assignments[role] = assignmentForProfile(name, profile);
    }
    return { version: VERSION, assignments };
  } catch {
    return defaultRouting();
  }
}

export function writeAssignment(repoRoot, role, assignment) {
  const file = routingPath(repoRoot);
  const current = readProfiles(file);
  fs.mkdirSync(path.dirname(routingPath(repoRoot)), { recursive: true });
  const normalized = normalizeProfile(role, assignment);
  current.profiles[role] = normalized;
  fs.writeFileSync(file, `${JSON.stringify(current, null, 2)}\n`);
  return assignmentForProfile(role, normalized);
}

export function normalizeAssignment(input = {}) {
  const provider = String(input.provider || '').trim();
  const known = PROVIDERS.find(p => p.id === provider);
  const model = String(input.model || known?.models?.[0] || '').trim();
  const command = String(input.command ?? known?.command ?? '').trim();
  const notes = String(input.notes || '').trim();
  const taskTypes = Array.isArray(input.taskTypes)
    ? input.taskTypes
    : String(input.taskTypes || '').split(',');
  return {
    provider,
    model,
    command,
    taskTypes: taskTypes.map(t => String(t).trim()).filter(Boolean).slice(0, 12),
    notes,
  };
}

function workspaceRoot() {
  if (process.env.FORJA_WORKSPACE) return path.resolve(process.env.FORJA_WORKSPACE);
  try {
    const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.forjarc.json'), 'utf8'));
    if (config.workspaceRoot) return path.resolve(config.workspaceRoot);
  } catch {}
  return path.join(os.homedir(), 'forja-workspace');
}

function readProfiles(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed.version === 1 && parsed.profiles && typeof parsed.profiles === 'object') return { version: 1, profiles: { ...parsed.profiles } };
  } catch {}
  return { version: 1, profiles: {} };
}

function normalizeProfile(role, input = {}) {
  const assignment = normalizeAssignment(input);
  const known = PROVIDERS.find(provider => provider.id === assignment.provider);
  const parts = assignment.command.split(/\s+/).filter(Boolean);
  const command = parts[0] || known?.command?.split(/\s+/)[0] || assignment.provider;
  const commandArgs = parts.slice(1);
  return {
    provider: assignment.provider,
    model: assignment.model || 'default',
    command,
    commandArgs,
    roles: [role],
    taskTypes: assignment.taskTypes,
    privacy: assignment.provider === 'ollama' ? 'local' : 'external',
    enabled: true,
  };
}

function assignmentForProfile(name, profile) {
  return {
    profile: name,
    provider: String(profile.provider || ''),
    model: String(profile.model || ''),
    command: [profile.command, ...(Array.isArray(profile.commandArgs) ? profile.commandArgs : [])].filter(Boolean).join(' '),
    taskTypes: Array.isArray(profile.taskTypes) ? profile.taskTypes : [],
    notes: `Perfil canônico do workspace: ${name}`,
    enabled: profile.enabled === true,
  };
}
