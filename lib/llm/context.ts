import fs from 'node:fs';
import path from 'node:path';

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
