/**
 * Command allowlist — fonte única de comandos que o endpoint /api/commands
 * tem permissão de disparar.
 *
 * Plan §4 + Decisão D4: hard-coded em código. Não ler de arquivo,
 * não construir dinamicamente, não aceitar regex/prefixo.
 *
 * Para adicionar um comando novo:
 *  1. Adicione entrada literal abaixo.
 *  2. Cubra com teste em allowlist.test.mjs.
 *  3. Documente em docs/dashboard.md.
 *
 * Entradas com acceptsArgs validam cada argumento por schema local fechado.
 */

const SLUG = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const PHASE = /^(spec|plan|implement|review)$/;
const CONTEXT_MODE = /^(global|domain|task)$/;
const SURFACE = /^(agent-console|dashboard|docs|landing|tool|fintech|premium)$/;
const SAFE_TEXT = /^[\p{L}\p{N}\s.,:;!?@/_#%+=()'"-]{0,240}$/u;
const SAFE_PATH = /^(design-md|projects|specs|\.context)\/[A-Za-z0-9._/@-]+\.md$/;

function checkedArgs(values = [], schema = []) {
  if (!Array.isArray(values) || values.length > schema.length) return null;
  const out = [];
  for (let i = 0; i < schema.length; i++) {
    const rule = schema[i];
    const raw = values[i];
    if (raw === undefined || raw === null || raw === '') {
      if (rule.optional) continue;
      return null;
    }
    const value = String(raw);
    if (!rule.re.test(value)) return null;
    out.push(value);
  }
  return out;
}

const ARG_SCHEMAS = Object.freeze({
  'gsd:plan': Object.freeze([
    { re: SLUG },
    { re: SAFE_TEXT, optional: true },
  ]),
  'gsd:handoff': Object.freeze([
    { re: PHASE },
    { re: SLUG },
    { re: SAFE_TEXT, optional: true },
  ]),
  'gsd:check': Object.freeze([
    { re: SLUG },
    { re: SAFE_PATH, optional: true },
  ]),
  'design:select': Object.freeze([
    { re: SURFACE },
    { re: SAFE_TEXT, optional: true },
  ]),
  'design:check': Object.freeze([
    { re: SAFE_PATH },
  ]),
  'context:build': Object.freeze([
    { re: CONTEXT_MODE },
    { re: SLUG },
    { re: SAFE_TEXT, optional: true },
  ]),
});

export const COMMAND_ALLOWLIST = Object.freeze({
  'spec:check': Object.freeze({
    cmd: 'node',
    args: Object.freeze(['scripts/spec-cli.mjs', 'check']),
    acceptsArgs: false,
    description: 'Valida que toda spec tem spec/plan/tasks coerentes',
  }),
  'sync:universal': Object.freeze({
    cmd: 'node',
    args: Object.freeze(['scripts/sync-universal-memory.js']),
    acceptsArgs: false,
    description: 'Reindexa memory/ no universal.db (FTS5)',
  }),
  'memory:vacuum': Object.freeze({
    cmd: 'node',
    args: Object.freeze(['scripts/compress-memory.mjs']),
    acceptsArgs: false,
    description: 'Archive de runs antigos + VACUUM do SQLite',
  }),
  'project:check': Object.freeze({
    cmd: 'node',
    args: Object.freeze(['scripts/check-standards.js']),
    acceptsArgs: false,
    description: 'Standards check (12-Factor, ADRs, secrets)',
  }),
  'sprint:status': Object.freeze({
    cmd: 'node',
    args: Object.freeze(['scripts/sprint-manager.js', 'status']),
    acceptsArgs: false,
    description: 'Resumo da sprint atual',
  }),
  'context:build': Object.freeze({
    cmd: 'node',
    args: Object.freeze(['scripts/dev.mjs', 'context:build']),
    acceptsArgs: true,
    description: 'Gera contexto inteligente global, domain ou task',
  }),
  'gsd:plan': Object.freeze({
    cmd: 'node',
    args: Object.freeze(['scripts/agent-harness.mjs', 'gsd:plan']),
    acceptsArgs: true,
    description: 'Cria runbook GSD para um projeto/slug',
  }),
  'gsd:handoff': Object.freeze({
    cmd: 'node',
    args: Object.freeze(['scripts/agent-harness.mjs', 'gsd:handoff']),
    acceptsArgs: true,
    description: 'Registra handoff GSD via Hermes para uma fase',
  }),
  'gsd:check': Object.freeze({
    cmd: 'node',
    args: Object.freeze(['scripts/agent-harness.mjs', 'gsd:check']),
    acceptsArgs: true,
    description: 'Valida gates GSD de um projeto',
  }),
  'design:select': Object.freeze({
    cmd: 'node',
    args: Object.freeze(['scripts/agent-harness.mjs', 'design:select']),
    acceptsArgs: true,
    description: 'Seleciona referências design-md por superfície e tom',
  }),
  'design:check': Object.freeze({
    cmd: 'node',
    args: Object.freeze(['scripts/agent-harness.mjs', 'design:check']),
    acceptsArgs: true,
    description: 'Valida brief visual preenchido',
  }),
});

export const ALLOWED_NAMES = Object.freeze(Object.keys(COMMAND_ALLOWLIST));

export function isAllowed(name) {
  return Object.prototype.hasOwnProperty.call(COMMAND_ALLOWLIST, name);
}

export function getCommand(name) {
  if (!isAllowed(name)) return null;
  return COMMAND_ALLOWLIST[name];
}

export function validateCommandArgs(name, values) {
  const entry = getCommand(name);
  if (!entry) return null;
  if (!entry.acceptsArgs) return values?.length ? null : [];
  return checkedArgs(values, ARG_SCHEMAS[name] || []);
}
