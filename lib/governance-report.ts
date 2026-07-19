/**
 * lib/governance-report.mjs — coleta o estado de governança e renderiza um painel HTML estático
 * (SPEC-014).
 *
 * É a resposta correta ao ADR-0022: o dashboard antigo era um *servidor* com rotas que executavam
 * processos (o passivo que o congelou). Este é um **artefato** — lê specs, ADRs, o registry e a
 * trilha de auditoria, e devolve uma string HTML self-contained. **Não executa nada**: o estado dos
 * gates vem do último exit registrado na auditoria (D4), não de reexecutar o gate.
 *
 * `collect` é puro (env injetável) e degrada quando falta dado (repo sem runs, sem workspace db).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { COMMANDS } from './core/registry.ts';
import { auditSummary, lastExit, defaultEnv as auditEnv } from './audit.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const STATUS_RE = /-\s*\*\*Status\*\*:\s*([a-z]+)/i;
const NUCLEO = ['native-abi', 'memory-db', 'memory-fresh', 'workspace', 'node-engines', 'runtime-deps', 'mcp-json'];
const DOC = ['docs-commands', 'commands-documented', 'docs-links'];

function readStatus(env, file) {
  try {
    const m = env.fs.readFileSync(file, 'utf8').match(STATUS_RE);
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

function collectSpecs(env) {
  const dir = path.join(env.root, 'specs');
  let entries: string[] = [];
  try {
    entries = env.fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out: { slug: string; spec: any; plan: any; tasks: any }[] = [];
  for (const slug of entries) {
    if (slug.startsWith('_') || slug.startsWith('.')) continue;
    const spec = readStatus(env, path.join(dir, slug, 'spec.md'));
    if (!spec) continue;
    out.push({
      slug,
      spec,
      plan: readStatus(env, path.join(dir, slug, 'plan.md')),
      tasks: readStatus(env, path.join(dir, slug, 'tasks.md')),
    });
  }
  return out;
}

function countAdrs(env) {
  try {
    return env.fs
      .readdirSync(path.join(env.root, 'memory', '90-decisions'))
      .filter((f) => /^\d{4}-.*\.md$/.test(f)).length;
  } catch {
    return 0;
  }
}

async function collectGates(env) {
  // Importa os catálogos como dados. Cada check: { id, title, severity }.
  const [{ CHECKS }, { RELEASE_CHECKS }] = await Promise.all([
    import('./core/health.ts'),
    import('./core/release.ts'),
  ]);
  const pick = (ids) => CHECKS.filter((c) => ids.includes(c.id)).map((c) => ({ id: c.id, severity: c.severity }));

  // Estado = último exit do comando na auditoria (não reexecuta — D4). Degrada para "?" sem audit.
  const exitOf = async (cmd) => {
    try {
      const r = await lastExit(auditEnv(), cmd);
      return r ? (r.exitCode === 0 ? 'pass' : 'fail') : 'unknown';
    } catch {
      return 'unknown';
    }
  };

  return [
    { name: 'núcleo', cmd: 'tools:doctor', adr: 'ADR-0023', state: await exitOf('tools:doctor'), checks: pick(NUCLEO) },
    { name: 'documentação', cmd: 'tools:doctor', adr: 'ADR-0025', state: await exitOf('tools:doctor'), checks: pick(DOC) },
    { name: 'tarball', cmd: 'release:check', adr: 'ADR-0024', state: await exitOf('release:check'), checks: RELEASE_CHECKS.map((c) => ({ id: c.id, severity: c.severity })) },
  ];
}

async function collectAudit() {
  try {
    return await auditSummary(auditEnv());
  } catch {
    return null; // sem workspace/db — o painel mostra "sem atividade", não quebra (AC-5/AC-6)
  }
}

/** @param {{ root?: string, fs?: typeof fs }} [env] */
export async function collect(env: { root?: string; fs?: typeof fs } = {}) {
  const e = { root: env.root ?? repoRoot, fs: env.fs ?? fs };
  const specs = collectSpecs(e);
  const adrs = countAdrs(e);
  return {
    generatedAt: new Date().toISOString(),
    metrics: { commands: Object.keys(COMMANDS).length, specs: specs.length, adrs },
    gates: await collectGates(e),
    specs,
    audit: await collectAudit(),
  };
}

// ---------------------------------------------------------------------------
// render — string HTML self-contained (CSS inline, zero asset externo)
// ---------------------------------------------------------------------------

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]));

function stageCell(v) {
  if (!v || v === null) return '<td class="st na">—</td>';
  return `<td class="st ${esc(v)}">${esc(v)}</td>`;
}

/** @param {Awaited<ReturnType<typeof collect>>} d */
export function renderHtml(d) {
  const gateCards = d.gates.map((g) => {
    const state = g.state === 'pass' ? 'PASS' : g.state === 'fail' ? 'FAIL' : '—';
    const checks = g.checks.map((c) => `<li><span class="cid">${esc(c.id)}</span><span class="sev ${esc(c.severity)}">${esc(c.severity)}</span></li>`).join('');
    return `<div class="gate ${esc(g.state)}"><div class="gh"><span class="gn">${esc(g.name)}</span><span class="gs">${state}</span></div><div class="gc">${esc(g.cmd)} · ${esc(g.adr)}</div><ul>${checks}</ul></div>`;
  }).join('');

  const specRows = d.specs.map((s) =>
    `<tr><td class="slug">${esc(s.slug)}</td>${stageCell(s.spec)}${stageCell(s.plan)}${stageCell(s.tasks)}</tr>`
  ).join('');

  const audit = d.audit;
  const auditBlock = audit && audit.total
    ? `<div class="ametrics"><div><b>${audit.total}</b><span>runs auditados</span></div><div><b>${audit.fails}</b><span>reprovações</span></div></div>
       <table class="board"><thead><tr><th>comando</th><th>runs</th><th>falhas</th><th>média</th></tr></thead><tbody>
       ${audit.byCmd.slice(0, 8).map((c) => `<tr><td class="slug">${esc(c.cmd)}</td><td class="num">${c.runs}</td><td class="num ${c.fails ? 'bad' : ''}">${c.fails}</td><td class="num">${c.avgMs ?? '—'}ms</td></tr>`).join('')}
       </tbody></table>`
    : `<p class="empty">Sem atividade registrada ainda. A trilha nasce em <code>.context/forja-runs.jsonl</code> conforme você usa o <code>forja</code>. Rode <code>forja audit:sync</code>.</p>`;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Forja · Governança</title><style>
:root{--bg:#eceef1;--panel:#fff;--panel2:#f5f6f9;--line:#dcdfe6;--ink:#191d24;--dim:#59626f;--faint:#8b93a0;--ember:#cf5a12;--good:#2b8a3e;--goodbg:#e5f3e8;--warn:#9a6a10;--warnbg:#f6ecd6;--crit:#c22f2f;--critbg:#f6dede;--mono:ui-monospace,"SF Mono",Menlo,monospace;--sans:system-ui,-apple-system,sans-serif}
@media(prefers-color-scheme:dark){:root{--bg:#101318;--panel:#181c22;--panel2:#1e232b;--line:#2a303a;--ink:#e6e9ee;--dim:#98a1ad;--faint:#69727e;--ember:#ff7a3c;--good:#46b45a;--goodbg:#16301c;--warn:#d1a02a;--warnbg:#302713;--crit:#f0564a;--critbg:#331917}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);line-height:1.5}
.wrap{max-width:1000px;margin:0 auto;padding:30px 20px 60px}
header{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:18px}
.mark{font-family:var(--mono);font-weight:600;font-size:23px}.mark b{color:var(--ember)}
.sub{color:var(--dim);font-size:13px}.gen{margin-left:auto;color:var(--faint);font-family:var(--mono);font-size:11.5px}
.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);border:1px solid var(--line);border-radius:12px;overflow:hidden;margin:22px 0 34px}
.metrics div{background:var(--panel);padding:14px 16px}.metrics b{font-family:var(--mono);font-size:25px;font-weight:600}.metrics span{display:block;color:var(--dim);font-size:12px;text-transform:uppercase;letter-spacing:.05em;margin-top:2px}
h2{font-size:19px;margin:34px 0 4px;letter-spacing:-.2px}.eye{font-family:var(--mono);font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:var(--ember)}
.lede{color:var(--dim);font-size:13.5px;margin:0 0 18px}
.gates{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.gate{background:var(--panel);border:1px solid var(--line);border-radius:13px;overflow:hidden}
.gh{display:flex;align-items:center;gap:8px;padding:13px 15px 10px;border-bottom:1px solid var(--line)}
.gn{font-family:var(--mono);font-weight:600;font-size:14px}.gs{margin-left:auto;font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:.05em}
.gate.pass .gs{color:var(--good)}.gate.fail .gs{color:var(--crit)}.gate.unknown .gs{color:var(--faint)}
.gc{font-family:var(--mono);font-size:11px;color:var(--faint);padding:8px 15px 2px}
.gate ul{list-style:none;margin:0;padding:6px 8px 10px}.gate li{display:flex;align-items:center;gap:8px;padding:5px 7px;font-size:12.5px}
.cid{font-family:var(--mono);font-size:12px}.sev{margin-left:auto;font-family:var(--mono);font-size:9px;font-weight:700;padding:2px 6px;border-radius:5px;text-transform:uppercase}
.sev.critical{color:var(--crit);background:var(--critbg)}.sev.warn{color:var(--warn);background:var(--warnbg)}
.board{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.board th,.board td{text-align:left;padding:10px 15px;border-bottom:1px solid var(--line);font-size:13px}
.board thead th{font-family:var(--mono);font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--faint);background:var(--panel2)}
.board tbody tr:last-child td{border-bottom:none}.slug{font-family:var(--mono);font-size:12.5px}.num{font-family:var(--mono);text-align:right;font-variant-numeric:tabular-nums}.num.bad{color:var(--crit)}
.st{font-family:var(--mono);font-size:11px;font-weight:600}.st.done{color:var(--good)}.st.approved{color:#2f6f9e}.st.abandoned{color:var(--faint);text-decoration:line-through}.st.na{color:var(--faint)}
.ametrics{display:flex;gap:24px;margin-bottom:14px}.ametrics b{font-family:var(--mono);font-size:22px}.ametrics span{color:var(--dim);font-size:12px;margin-left:6px}
.empty{color:var(--dim);font-size:13.5px;background:var(--panel);border:1px dashed var(--line);border-radius:12px;padding:18px}code{font-family:var(--mono);font-size:.9em}
footer{margin-top:40px;padding-top:18px;border-top:1px solid var(--line);color:var(--faint);font-size:12px;display:flex;flex-wrap:wrap;gap:6px 16px}
</style></head><body><div class="wrap">
<header><span class="mark">for<b>j</b>a</span><span class="sub">painel de governança</span><span class="gen">gerado ${esc(d.generatedAt.slice(0, 16).replace('T', ' '))}</span></header>
<div class="metrics"><div><b>${d.metrics.commands}</b><span>comandos</span></div><div><b>${d.metrics.specs}</b><span>specs</span></div><div><b>${d.metrics.adrs}</b><span>ADRs</span></div></div>
<div class="eye">o motor</div><h2>Gates de invariante</h2><p class="lede">Estado do último run de cada gate na auditoria — sem reexecutar.</p><div class="gates">${gateCards}</div>
<div class="eye">o processo</div><h2>Pipeline SDD</h2><p class="lede">O estado real das features, do <code>spec:check</code>.</p><table class="board"><thead><tr><th>feature</th><th>spec</th><th>plan</th><th>tasks</th></tr></thead><tbody>${specRows}</tbody></table>
<div class="eye">a atividade</div><h2>Auditoria</h2><p class="lede">A trilha <code>.context/forja-runs.jsonl</code>, consultável.</p>${auditBlock}
<footer><span>Artefato <b>gerado</b>, não servido — leitura, nunca execução (ADR-0022).</span><span style="margin-left:auto" class="slug">forja governance:dashboard</span></footer>
</div></body></html>`;
}
