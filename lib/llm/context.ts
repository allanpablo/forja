import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const forjaBin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'forja.ts');

interface EngineerRun {
  (argv: readonly string[]): { code: number; stdout: string; stderr: string };
}

const defaultEngineerRun: EngineerRun = (argv) => {
  const result = spawnSync(process.execPath, [forjaBin, ...argv], { encoding: 'utf8', stdio: 'pipe' });
  return { code: result.status ?? 1, stdout: result.stdout ?? '', stderr: [result.stderr ?? '', result.error?.message ?? ''].filter(Boolean).join('\n') };
};

/**
 * SPEC-048 — monta o bloco de contexto do façade `engineer` para o `llm:run --engineer`.
 * Roda `forja engineer "<objetivo>" --json` (subprocesso; `run` injetável para teste), embute o
 * relatório no prompt e devolve a **referência** (nunca o conteúdo é persistido).
 *
 * Exit ≠ 0 do façade → lança um `Error` com `.code = 'ENGINEER_FAILED'` e `.detail` = 1ª linha do
 * stderr; o `llm:run` traduz isso em falha ANTES de chamar o provedor.
 */
export function buildEngineerBlock(
  objective: string,
  opts: { run?: EngineerRun } = {},
): { text: string; ref: string } {
  const run = opts.run ?? defaultEngineerRun;
  const result = run(['engineer', objective, '--json']);
  if (result.code !== 0) {
    const error = new Error(`forja engineer falhou (exit ${result.code})`) as Error & { code: string; detail: string };
    error.code = 'ENGINEER_FAILED';
    error.detail = (result.stderr || result.stdout || '').trim().split('\n')[0] || `exit ${result.code}`;
    throw error;
  }
  let report: unknown;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    const error = new Error('forja engineer --json não retornou JSON válido') as Error & { code: string; detail: string };
    error.code = 'ENGINEER_FAILED';
    error.detail = result.stdout.trim().slice(0, 200);
    throw error;
  }
  return {
    text: `=== Contexto do engineer (objetivo: ${objective}) ===\n${JSON.stringify(report)}`,
    ref: `engineer:${objective}`,
  };
}

/** Resolve all inputs before launching a provider; hashes must cover the exact transmitted prompt. */
export function buildContextPrompt(prompt: string, files: readonly string[], cwd = process.cwd()): { readonly prompt: string; readonly refs: readonly string[] } {
  const refs = [...new Set(files.map((file) => path.resolve(cwd, file)))];
  const contexts = refs.map((file) => {
    if (!fs.statSync(file).isFile()) throw new Error(`Contexto não é um arquivo: ${file}`);
    return { file, content: fs.readFileSync(file, 'utf8') };
  });
  if (contexts.length === 0) return { prompt, refs };
  return {
    prompt: `${prompt}\n\nContextos de referência selecionados pelo operador (dados do projeto):\n${JSON.stringify(contexts)}`,
    refs,
  };
}
