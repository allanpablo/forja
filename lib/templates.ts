/**
 * lib/templates.ts — boilerplates como ponto de partida de um projeto (`project:new --template`).
 *
 * Um boilerplate só vira template quando o manifest declara `"template": true`: isso promete que
 * o backend dele instala, compila, passa nos testes e no lint — promessa cobrada pelo
 * `project:smoke --full --template <nome>`. Os demais seguem como arquitetura de referência
 * (catálogo), e o `--template` os recusa dizendo por quê, em vez de gerar um projeto quebrado.
 */

import fs from 'node:fs';
import path from 'node:path';
import { asset } from './paths.ts';

export interface TemplateInfo {
  readonly name: string;
  readonly dir: string;
  readonly title: string;
  readonly ready: boolean;
  readonly stack: readonly string[];
}

/** Arquivos do boilerplate que descrevem o boilerplate, não o projeto. */
const SKIP = new Set(['boilerplate.manifest.json', 'node_modules', 'dist', '.git']);

export function listTemplates(root = asset('boilerplates')): TemplateInfo[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const dir = path.join(root, e.name);
      let manifest: any = {};
      try { manifest = JSON.parse(fs.readFileSync(path.join(dir, 'boilerplate.manifest.json'), 'utf8')); } catch { /* sem manifest */ }
      return { name: e.name, dir, title: String(manifest.title ?? e.name), ready: manifest.template === true, stack: manifest.stack ?? [] };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Aceita o nome inteiro (`06-clean-arch`) ou sem o prefixo numérico (`clean-arch`). */
export function resolveTemplate(name: string, root?: string): TemplateInfo {
  const all = listTemplates(root);
  const found = all.find((t) => t.name === name || t.name.replace(/^\d+-/, '') === name);
  const ready = all.filter((t) => t.ready).map((t) => t.name.replace(/^\d+-/, ''));
  if (!found) throw new Error(`template desconhecido: ${name}. Disponíveis: ${ready.join(', ') || '(nenhum)'} — veja forja project:templates`);
  if (!found.ready) {
    throw new Error(`${found.name} é arquitetura de referência, ainda não um template validado (instalação/build/testes). ` +
      `Disponíveis: ${ready.join(', ') || '(nenhum)'}. Use-o como referência: boilerplates/${found.name}/`);
  }
  return found;
}

function copyTree(src: string, dest: string, out: string[], rel = '') {
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const s = path.join(src, e.name);
    const r = path.join(rel, e.name);
    if (e.isDirectory()) copyTree(s, dest, out, r);
    else {
      fs.mkdirSync(path.dirname(path.join(dest, r)), { recursive: true });
      fs.copyFileSync(s, path.join(dest, r));
      out.push(r);
    }
  }
}

/**
 * Aplica o template sobre um projeto já com a memória gerada: o código e a memória específica do
 * boilerplate prevalecem sobre os genéricos (o README do boilerplate vai para `docs/template.md`, o
 * do projeto fica). Registra a origem em `.forja/template.json`.
 */
export function applyTemplate(projectDir: string, template: TemplateInfo): string[] {
  const copied: string[] = [];
  const staging = path.join(projectDir, '.forja', '.template-staging');
  fs.rmSync(staging, { recursive: true, force: true });
  copyTree(template.dir, staging, []);
  const readme = path.join(staging, 'README.md');
  if (fs.existsSync(readme)) {
    fs.mkdirSync(path.join(staging, 'docs'), { recursive: true });
    fs.renameSync(readme, path.join(staging, 'docs', 'template.md'));
  }
  copyTree(staging, projectDir, copied);
  fs.rmSync(staging, { recursive: true, force: true });
  fs.writeFileSync(path.join(projectDir, '.forja', 'template.json'), `${JSON.stringify({ name: template.name, title: template.title, appliedAt: new Date().toISOString() }, null, 2)}\n`);
  return copied;
}
