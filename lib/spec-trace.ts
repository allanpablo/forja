/**
 * lib/spec-trace.ts — critérios de aceite ligados aos testes que os citam (SPEC-053, ADR-0092).
 *
 * A ligação mora no teste: `SPEC-NNN AC-N` ou `<slug> AC-N` no nome ou num comentário; `AC-N`
 * sozinho vale quando o arquivo cita uma única spec. Estático (não roda testes), qualquer stack.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export interface Criterion {
  readonly id: string;
  readonly text: string;
}

export interface TestRef {
  readonly file: string;
  readonly line: number;
}

export interface SpecTrace {
  readonly slug: string;
  readonly specId: string | null;
  readonly status: string;
  readonly criteria: readonly { id: string; text: string; tests: readonly TestRef[] }[];
  readonly uncovered: readonly string[];
  readonly orphans: readonly { ac: string; ref: TestRef }[];
}

export interface TraceReport {
  readonly specs: readonly SpecTrace[];
  readonly testFiles: number;
  /** `AC-N` sem spec identificável (arquivo cita 0 ou várias specs). */
  readonly ambiguous: readonly { ac: string; ref: TestRef; reason: string }[];
}

/** Status em que "pronto" já foi prometido: o `--strict` cobra a rastreabilidade. */
export const GATED_STATUSES = new Set(['approved', 'implementing', 'done']);

// `AC-1 (RF-01): …` também: agentes ligam o critério ao requisito entre parênteses.
const AC_LINE = /^\s*[-*]\s*(?:\[[ xX]\]\s*)?\**(AC-\d+)\**(?:\s*\([^)\n]*\))?\s*[:—–-]\s*(.+)$/;
const SPEC_ID = /\*\*ID\*\*:\s*(SPEC-\d+)/;
const STATUS = /-\s*\*\*Status\*\*:\s*([a-z-]+)/i;

const CODE_EXT = /\.(?:[cm]?[jt]sx?|py|go|rb|java|kt|cs|php|rs|swift|exs?)$/;
const TEST_NAME = /(?:\.(?:test|spec)\.[cm]?[jt]sx?$|^test_.+\.py$|_test\.(?:py|go)$|Tests?\.(?:java|kt|cs)$|_spec\.rb$)/;
const TEST_DIRS = new Set(['test', 'tests', '__tests__', 'spec']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', 'vendor', 'target', 'fixtures', '__fixtures__', '__snapshots__']);

/** Grupo qualificado: `SPEC-029 AC-5/AC-6`, `pagamentos AC-1, AC-2`, `SPEC-053 (AC-3)`. */
const QUALIFIED = /\b(SPEC-\d+|[a-z0-9]+(?:-[a-z0-9]+)*)[\s#:(]+(AC-\d+(?:\s*(?:\/|,|&|\be\b|\band\b)\s*AC-\d+)*)/g;
const AC_TOKEN = /\bAC-\d+\b/g;

export function parseCriteria(specText: string): Criterion[] {
  const out: Criterion[] = [];
  for (const line of specText.split('\n')) {
    const m = line.match(AC_LINE);
    if (m && !out.some((c) => c.id === m[1])) out.push({ id: m[1], text: m[2].trim() });
  }
  return out;
}

export function isTestFile(rel: string): boolean {
  const parts = rel.split('/');
  if (parts.some((p) => SKIP_DIRS.has(p))) return false;
  const base = parts[parts.length - 1];
  if (TEST_NAME.test(base)) return true;
  return CODE_EXT.test(base) && parts.slice(0, -1).some((p) => TEST_DIRS.has(p));
}

function listFiles(root: string): string[] {
  const git = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (git.status === 0) return git.stdout.split('\n').filter(Boolean);
  const out: string[] = [];
  const walk = (dir: string, rel: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else if (e.isFile()) out.push(r);
    }
  };
  walk(root, '');
  return out;
}

interface SpecInfo { slug: string; specId: string | null; status: string; criteria: Criterion[] }

function loadSpecs(root: string): SpecInfo[] {
  const dir = path.join(root, 'specs');
  let slugs: string[] = [];
  try { slugs = fs.readdirSync(dir).filter((s) => !s.startsWith('_') && !s.startsWith('.')); } catch { return []; }
  const out: SpecInfo[] = [];
  for (const slug of slugs.sort()) {
    let text: string;
    try { text = fs.readFileSync(path.join(dir, slug, 'spec.md'), 'utf8'); } catch { continue; }
    out.push({ slug, specId: text.match(SPEC_ID)?.[1] ?? null, status: text.match(STATUS)?.[1]?.toLowerCase() ?? 'unknown', criteria: parseCriteria(text) });
  }
  return out;
}

export function traceSpecs(root: string): TraceReport {
  const specs = loadSpecs(root);
  const bySlug = new Map(specs.map((s) => [s.slug, s]));
  const byId = new Map<string, SpecInfo>();
  for (const s of specs) if (s.specId && !byId.has(s.specId)) byId.set(s.specId, s);
  const resolve = (q: string) => byId.get(q) ?? bySlug.get(q) ?? null;

  const hits = new Map<string, TestRef[]>(); // `${slug}#AC-N` → refs
  const orphans = new Map<string, { ac: string; ref: TestRef }[]>();
  const ambiguous: { ac: string; ref: TestRef; reason: string }[] = [];
  const has = (spec: SpecInfo, ac: string) => spec.criteria.some((c) => c.id === ac);
  const cite = (spec: SpecInfo, ac: string, ref: TestRef) => {
    if (has(spec, ac)) {
      const k = `${spec.slug}#${ac}`;
      const list = hits.get(k) ?? [];
      if (!list.some((r) => r.file === ref.file && r.line === ref.line)) list.push(ref);
      hits.set(k, list);
    } else {
      const list = orphans.get(spec.slug) ?? [];
      list.push({ ac, ref });
      orphans.set(spec.slug, list);
    }
  };

  const testFiles = listFiles(root).filter(isTestFile);
  for (const rel of testFiles) {
    let text: string;
    try { text = fs.readFileSync(path.join(root, rel), 'utf8'); } catch { continue; }
    if (!text.includes('AC-')) continue;

    // Specs que o arquivo cita: pelo ID, por `specs/<slug>` ou pelo slug com hífen (palavra única
    // como "gates" ou "help" aparece em qualquer teste; só conta qualificada ou pelo caminho).
    const cited = new Set<SpecInfo>();
    for (const m of text.matchAll(/\bSPEC-\d+\b/g)) { const s = byId.get(m[0]); if (s) cited.add(s); }
    const base = path.basename(rel).replace(/\.(?:test|spec)\.[cm]?[jt]sx?$|\.[a-z]+$/, '').replace(/^test_|_test$/, '').replace(/_/g, '-');
    for (const s of specs) {
      if (base === s.slug || text.includes(`specs/${s.slug}`) || (s.slug.includes('-') && new RegExp(`\\b${s.slug}\\b`).test(text))) cited.add(s);
    }

    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (!line.includes('AC-')) return;
      const ref = { file: rel, line: i + 1 };
      const consumed: [number, number][] = [];
      for (const m of line.matchAll(QUALIFIED)) {
        const spec = resolve(m[1]);
        if (!spec) continue;
        consumed.push([m.index!, m.index! + m[0].length]);
        for (const ac of m[2].match(AC_TOKEN) ?? []) cite(spec, ac, ref);
      }
      for (const m of line.matchAll(AC_TOKEN)) {
        if (consumed.some(([a, b]) => m.index! >= a && m.index! < b)) continue;
        // `AC-N` solto é ligação fraca: conta se o critério existe na única spec do arquivo; se não
        // existe, provavelmente é de outra spec — ambíguo, não órfão (órfã é só a citação qualificada).
        const only = cited.size === 1 ? [...cited][0] : null;
        if (only && has(only, m[0])) cite(only, m[0], ref);
        else if (only) ambiguous.push({ ac: m[0], ref, reason: `${m[0]} não existe em ${only.slug}, a única spec citada no arquivo` });
        else ambiguous.push({ ac: m[0], ref, reason: cited.size ? `arquivo cita ${cited.size} specs` : 'arquivo não cita nenhuma spec' });
      }
    });
  }

  return {
    testFiles: testFiles.length,
    ambiguous,
    specs: specs.map((s) => {
      const criteria = s.criteria.map((c) => ({ id: c.id, text: c.text, tests: hits.get(`${s.slug}#${c.id}`) ?? [] }));
      return { slug: s.slug, specId: s.specId, status: s.status, criteria, uncovered: criteria.filter((c) => !c.tests.length).map((c) => c.id), orphans: orphans.get(s.slug) ?? [] };
    }),
  };
}

/** Specs que reprovam no `--strict`: status com "pronto" prometido e lacuna de rastreio. */
export function strictFailures(specs: readonly SpecTrace[]): SpecTrace[] {
  return specs.filter((s) => GATED_STATUSES.has(s.status) && (s.uncovered.length > 0 || s.orphans.length > 0));
}
