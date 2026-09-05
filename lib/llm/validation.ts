import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Ajv, type ValidateFunction } from 'ajv';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { runLlm } from '../../packages/llm/src/index.ts';

export interface ValidationCommand {
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly timeoutMs: number;
}

export interface PreparedValidation {
  readonly schemaPath?: string;
  readonly schemaHash?: string;
  readonly schemaText?: string;
  readonly validateSchema?: ValidateFunction;
  readonly manifestPath?: string;
  readonly manifestHash?: string;
  readonly commands: readonly ValidationCommand[];
}

export interface ValidationEvidence {
  readonly name: string;
  readonly passed: boolean;
  readonly exitCode: number;
  readonly durationMs: number;
  readonly errorCode?: string;
  readonly stdoutHash: string;
  readonly stderrHash: string;
}

export interface LlmValidation {
  readonly status: 'accepted' | 'rejected' | 'inconclusive' | 'blocked';
  readonly formatStatus: 'accepted' | 'rejected' | 'not-requested';
  readonly checks: readonly ValidationEvidence[];
  readonly schemaHash?: string;
  readonly manifestHash?: string;
  readonly responseHash: string;
  readonly errorCode?: string;
}

const manifestSchema = {
  type: 'object', required: ['version', 'checks'], additionalProperties: false,
  properties: {
    version: { const: 1 },
    checks: { type: 'array', minItems: 1, maxItems: 20, items: {
      type: 'object', required: ['name', 'command'], additionalProperties: false,
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 120, pattern: '\\S' },
        command: { type: 'string', minLength: 1, pattern: '^\\S+$' },
        args: { type: 'array', items: { type: 'string' } },
        timeoutMs: { type: 'integer', minimum: 1, maximum: 600000 },
      },
    } },
  },
};

/** Snapshot and compile contracts before model execution. No network, coercion or async schemas. */
export function prepareValidation(schemaFile?: string, manifestFile?: string): PreparedValidation {
  let schemaPath: string | undefined;
  let schemaText: string | undefined;
  let validateSchema: ValidateFunction | undefined;
  if (schemaFile !== undefined) {
    schemaPath = path.resolve(schemaFile);
    schemaText = fs.readFileSync(schemaPath, 'utf8');
    const schema: unknown = JSON.parse(schemaText);
    if (typeof schema !== 'boolean' && !object(schema)) throw new Error('JSON Schema inválido.');
    if (object(schema) && schema.$async) throw new Error('Schemas assíncronos não são suportados.');
    const validator = object(schema) && schema.$schema === 'https://json-schema.org/draft/2020-12/schema'
      ? new Ajv2020({ strict: true, allErrors: true }) : new Ajv({ strict: true, allErrors: true });
    validateSchema = validator.compile(schema);
    if ('$async' in validateSchema && validateSchema.$async === true) throw new Error('Schemas assíncronos não são suportados.');
  }
  let manifestPath: string | undefined;
  let manifestHash: string | undefined;
  let commands: ValidationCommand[] = [];
  if (manifestFile !== undefined) {
    manifestPath = path.resolve(manifestFile);
    const text = fs.readFileSync(manifestPath, 'utf8');
    const value: unknown = JSON.parse(text);
    const validator = new Ajv({ strict: true }).compile(manifestSchema);
    if (!validator(value)) throw new Error('Manifest de validação inválido: esperado version 1 e checks com name, command, args e timeoutMs opcionais.');
    const manifest = value as { checks: { name: string; command: string; args?: string[]; timeoutMs?: number }[] };
    commands = manifest.checks.map((check) => ({ ...check, args: check.args ?? [], timeoutMs: check.timeoutMs ?? 120000 }));
    if (new Set(commands.map((check) => check.name)).size !== commands.length) throw new Error('Nomes de checks devem ser únicos.');
    manifestHash = hash(text);
  }
  return { schemaPath, schemaText, schemaHash: schemaText === undefined ? undefined : hash(schemaText), validateSchema, manifestPath, manifestHash, commands };
}

export async function validateLlmResponse(prepared: PreparedValidation, response: string, cwd: string, executionSucceeded: boolean): Promise<LlmValidation> {
  const base = { schemaHash: prepared.schemaHash, manifestHash: prepared.manifestHash, responseHash: hash(response) };
  if (!executionSucceeded) return { ...base, status: 'blocked', formatStatus: 'not-requested', checks: [], errorCode: 'EXECUTION_FAILED' };
  let formatStatus: LlmValidation['formatStatus'] = 'not-requested';
  if (prepared.validateSchema) {
    let data: unknown;
    try { data = JSON.parse(response); } catch { return { ...base, status: 'rejected', formatStatus: 'rejected', checks: [], errorCode: 'INVALID_RESPONSE_JSON' }; }
    if (!prepared.validateSchema(data)) return { ...base, status: 'rejected', formatStatus: 'rejected', checks: [], errorCode: 'RESPONSE_SCHEMA_MISMATCH' };
    formatStatus = 'accepted';
  }
  const checks: ValidationEvidence[] = [];
  for (const check of prepared.commands) {
    // Only the preloaded operator manifest selects commands. Model output is data on stdin.
    const result = await runLlm({ executable: check.command, args: check.args, stdin: response }, cwd, check.timeoutMs);
    checks.push({ name: check.name, passed: result.exitCode === 0, exitCode: result.exitCode, durationMs: result.durationMs,
      errorCode: result.errorCode, stdoutHash: hash(result.stdout), stderrHash: hash(result.stderr) });
    if (result.exitCode !== 0) return { ...base, status: 'rejected', formatStatus, checks, errorCode: 'VALIDATION_CHECK_FAILED' };
  }
  return { ...base, status: checks.length === 0 ? 'inconclusive' : 'accepted', formatStatus, checks };
}

function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
