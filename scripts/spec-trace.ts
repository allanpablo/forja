#!/usr/bin/env node
/**
 * spec:trace — critérios de aceite × testes que os citam (SPEC-053, ADR-0092).
 *
 *   forja spec:trace [slug] [--strict] [--json]
 *
 * Sem `--strict` só informa (exit 0). Com `--strict`, spec approved/implementing/done com critério
 * sem teste ou citação órfã → exit 2 (`rejected`, ADR-0082).
 */

import path from 'node:path';
import { emitError, emitOk, emitRejected } from '../lib/cli-output.ts';
import { GATED_STATUSES, strictFailures, traceSpecs, type SpecTrace } from '../lib/spec-trace.ts';

const args = process.argv.slice(2);
const json = args.includes('--json');
const strict = args.includes('--strict');
const slug = args.find((a) => !a.startsWith('--'));
const root = path.resolve(process.cwd());

const report = traceSpecs(root);
let specs = report.specs;
if (slug) {
  specs = specs.filter((s) => s.slug === slug || s.specId === slug.toUpperCase());
  if (!specs.length) {
    if (json) emitError(`spec não encontrada: ${slug}`, { code: 'NOT_FOUND' });
    console.error(`spec não encontrada: ${slug} (veja specs/)`);
    process.exit(1);
  }
}
const withCriteria = specs.filter((s) => s.criteria.length);
const failures = strict ? strictFailures(withCriteria) : [];
const total = withCriteria.reduce((n, s) => n + s.criteria.length, 0);
const covered = withCriteria.reduce((n, s) => n + s.criteria.length - s.uncovered.length, 0);
const ambiguous = slug ? [] : report.ambiguous;

if (json) {
  const payload = {
    totals: { specs: withCriteria.length, criteria: total, covered, testFiles: report.testFiles },
    specs: withCriteria,
    ambiguous,
    ...(strict ? { failing: failures.map((s) => s.slug) } : {}),
  };
  if (failures.length) emitRejected(payload);
  emitOk(payload);
}

const where = (r: { file: string; line: number }) => `${r.file}:${r.line}`;
function print(s: SpecTrace) {
  const n = s.criteria.length - s.uncovered.length;
  const mark = n === s.criteria.length && !s.orphans.length ? '✓' : GATED(s) ? '✗' : '·';
  console.log(`${mark} ${s.specId ?? '—'} ${s.slug} [${s.status}] — ${n}/${s.criteria.length} critérios com teste`);
  for (const c of s.criteria) {
    if (c.tests.length) console.log(`    ✓ ${c.id}  ${c.tests.slice(0, 3).map(where).join(', ')}${c.tests.length > 3 ? ` (+${c.tests.length - 3})` : ''}`);
    else console.log(`    ✗ ${c.id}  sem teste — ${c.text.slice(0, 80)}`);
  }
  for (const o of s.orphans) console.log(`    ⚠ ${o.ac} não existe na spec, mas ${where(o.ref)} o cita`);
}
function GATED(s: SpecTrace) { return GATED_STATUSES.has(s.status); }

if (!withCriteria.length) {
  console.log(slug ? `${slug}: a spec não tem critérios AC-N.` : 'Nenhuma spec com critérios AC-N em specs/.');
  process.exit(0);
}
for (const s of withCriteria) print(s);
console.log(`\n${covered}/${total} critérios com teste em ${withCriteria.length} spec(s) · ${report.testFiles} arquivo(s) de teste lidos`);
if (ambiguous.length) console.log(`${ambiguous.length} citação(ões) AC-N sem spec identificável (motivo em --json): qualifique com SPEC-NNN AC-N.`);
console.log('Para ligar um teste: cite `SPEC-NNN AC-N` no nome ou num comentário do teste.');
if (strict && failures.length) {
  console.log(`\n✗ --strict: ${failures.length} spec(s) com "pronto" prometido e lacuna de rastreio: ${failures.map((s) => s.slug).join(', ')}`);
  process.exit(2);
}
