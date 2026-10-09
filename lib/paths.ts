/**
 * lib/paths.ts — as duas raízes do Forja, resolvidas num lugar só (ADR-0086).
 *
 * O Forja roda de dois layouts:
 *
 *   dev (checkout)            publicado (node_modules/forjajs)
 *   <repo>/lib/paths.ts       <pkg>/dist/lib/paths.js
 *   <repo>/scripts/*.ts       <pkg>/dist/scripts/*.js
 *   <repo>/memory, docs, …    <pkg>/memory, docs, …   ← fora do dist/
 *
 * Por isso há duas raízes, e confundi-las foi a fonte recorrente de bugs "funciona no repo, quebra
 * instalado" (v1.6.1 no spec-cli; v4.x no init-project, setup e 18 outros scripts, que faziam
 * `path.resolve(__dirname, '..')` e no pacote acabavam em `dist/`):
 *
 *   - `codeRoot` → onde vive o CÓDIGO executável (scripts, bins). Repo em dev; `dist/` publicado.
 *                  Use com `script()` para spawnar um script sem cravar extensão.
 *   - `pkgRoot`  → onde vivem os ASSETS versionados (memory/, docs/, prompts/, templates/,
 *                  specs/_templates, .claude/, design-md/, boilerplates/, package.json).
 *                  É a raiz do pacote nos dois layouts.
 *
 * Nenhum outro módulo deve calcular raiz a partir de `__dirname` — o teste `paths.test.js` vigia.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_NAME = 'forjajs';
const here = path.dirname(fileURLToPath(import.meta.url));

/** Raiz do código: um nível acima de `lib/` (repo em dev, `dist/` no pacote). */
export const codeRoot: string = path.resolve(here, '..');

/** Sobe a partir de `start` até o `package.json` do Forja. Fallback: `start`. */
export function findPkgRoot(start: string, fsImpl: Pick<typeof fs, 'existsSync' | 'readFileSync'> = fs): string {
  let dir = path.resolve(start);
  for (;;) {
    const manifest = path.join(dir, 'package.json');
    if (fsImpl.existsSync(manifest)) {
      try {
        if (JSON.parse(String(fsImpl.readFileSync(manifest, 'utf8'))).name === PKG_NAME) return dir;
      } catch { /* manifest ilegível: segue subindo */ }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start);
    dir = parent;
  }
}

/** Raiz dos assets versionados — a raiz do pacote nos dois layouts. */
export const pkgRoot: string = findPkgRoot(codeRoot);

/** Caminho de um asset versionado (ex.: `asset('memory', '90-decisions')`). */
export function asset(...segments: string[]): string {
  return path.join(pkgRoot, ...segments);
}

/**
 * Resolve um script/bin para o arquivo que existe, **agnóstico de extensão**: tenta o caminho
 * dado e depois `.ts → .js → .mjs`. Em dev acha a fonte `.ts`; publicado, o `.js` sob `dist/`.
 * Devolve o candidato original quando nada existe — o spawn então falha visível, não silencioso.
 */
export function resolveScript(root: string, rel: string): string {
  const direct = path.join(root, rel);
  if (fs.existsSync(direct)) return direct;
  const base = direct.replace(/\.(mjs|cjs|js|ts)$/, '');
  for (const ext of ['.ts', '.js', '.mjs']) {
    if (fs.existsSync(base + ext)) return base + ext;
  }
  return direct;
}

/** Script do Forja relativo à raiz do código (ex.: `script('bin/create-memory-nest-kit')`). */
export function script(rel: string): string {
  return resolveScript(codeRoot, rel);
}
