/**
 * lib/docs-reference.ts — o lado "código" da coerência de documentação (SPEC-055).
 *
 * A leitura da doc como dado vive em `core/doc-graph.ts` (scanCommands/scanFlags/scanSkillCounts) e
 * o juízo vive nos checks de `core/health.ts`. Aqui ficam só as três referências derivadas do código
 * contra as quais a doc é comparada:
 *
 *   declaredFlags    o que cada comando aceita (usage + examples do registry + flags do dispatcher)
 *   skillsCount      quantas skills existem de fato em templates/project/skills
 *   renderCommandsDoc a referência completa de comandos, gerada — conteúdo de docs/commands.md
 *
 * Não há scanner próprio de propósito: um segundo scanner de markdown diverge do primeiro com o
 * tempo, e divergência entre superfícies que deveriam concordar é o defeito que a SPEC-009 matou.
 */

import type { CommandSpec } from './core/registry.ts';
import { flagTokens } from './core/doc-graph.ts';

/** Flags tratadas pelo dispatcher (bin/forja.ts), não pelo comando — valem em qualquer linha. */
export const GLOBAL_FLAGS = new Set(['--help', '-h', '--json']);

/** Flags que um comando declara em `usage`/`examples`, mais as globais do dispatcher. */
export function declaredFlags(spec: CommandSpec): Set<string> {
  const source = [spec.usage ?? '', ...(spec.examples ?? [])].join(' ');
  return new Set([...GLOBAL_FLAGS, ...flagTokens(source)]);
}

interface FsLike {
  existsSync(p: string): boolean;
  readdirSync(p: string, opts: { withFileTypes: true }): { isDirectory(): boolean }[];
}

/**
 * Skills reais distribuídas aos projetos gerados — só diretórios (o README.md da pasta não conta).
 * Recebe o diretório pronto para não impor separador de caminho nenhum (portável entre SOs).
 */
export function skillsCount(fsLike: FsLike, skillsDir: string): number {
  if (!fsLike.existsSync(skillsDir)) return 0;
  return fsLike.readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
}

/** Referência completa de comandos, gerada do registry — conteúdo canônico de docs/commands.md. */
export function renderCommandsDoc(registry: Record<string, CommandSpec>, skills: number): string {
  const domains: string[] = [];
  for (const spec of Object.values(registry)) {
    if (!domains.includes(spec.domain)) domains.push(spec.domain);
  }
  const cell = (v: string) => v.replace(/\|/g, '\\|');
  const out: string[] = [
    '# Referência de comandos',
    '',
    '> Gerado por `forja docs:gen` a partir de `lib/core/registry.ts` — **não edite à mão.**',
    `> ${Object.keys(registry).length} comandos · ${skills} skills distribuídas aos projetos gerados.`,
    '',
  ];
  for (const domain of domains) {
    out.push(`## ${domain}`, '', '| Comando | O que faz | Uso | Tier | Gates |', '|---|---|---|---|---|');
    for (const [name, spec] of Object.entries(registry)) {
      if (spec.domain !== domain) continue;
      out.push(
        `| \`forja ${name}\` | ${cell(spec.desc)} | \`${cell(spec.usage ?? `forja ${name}`)}\` | ${spec.tier ?? 'advanced'} | ${spec.gates?.join(', ') ?? '—'} |`,
      );
    }
    out.push('');
  }
  return out.join('\n');
}
