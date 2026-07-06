/**
 * spec-parser — extrai metadados do cabeçalho de specs/<slug>/spec.md.
 *
 * Formato esperado (templates em specs/_templates/spec.md):
 *
 *   # Spec: <feature>
 *
 *   - **ID**: SPEC-XXX
 *   - **Status**: draft | review | approved | implementing | done | abandoned
 *   - **Owner**: ...
 *   - **Criado em**: YYYY-MM-DD
 *   - **Sprint alvo**: ...
 *   - **ADRs relacionadas**: ...
 *
 * Robustez:
 *  - Não importa ordem das linhas.
 *  - Tolera espaços extras, asteriscos faltantes.
 *  - Status devolve só o primeiro token alfa (ignora a linha-template "draft | review | ...").
 */

const FIELD_RE = /^\s*-\s*\*\*([^*]+)\*\*\s*:\s*(.+?)\s*$/i;
const STATUS_VALID = new Set(['draft', 'review', 'approved', 'implementing', 'done', 'abandoned']);

const FIELD_MAP = {
  id: 'id',
  status: 'status',
  owner: 'owner',
  'criado em': 'createdAt',
  'sprint alvo': 'sprint',
  'adrs relacionadas': 'adrs',
};

export function parseSpec(content) {
  const out = { id: null, status: null, owner: null, createdAt: null, sprint: null, adrs: null, title: null };
  if (!content) return out;

  const lines = content.split('\n');
  for (const line of lines) {
    if (!out.title) {
      const t = line.match(/^#\s+Spec:\s*(.+?)\s*$/i);
      if (t) { out.title = t[1]; continue; }
    }
    const m = line.match(FIELD_RE);
    if (!m) continue;
    const key = m[1].trim().toLowerCase();
    const value = m[2].trim();
    const mapped = FIELD_MAP[key];
    if (!mapped) continue;
    out[mapped] = value;
    if (mapped === 'status') {
      // pega só o primeiro token válido — protege contra linha-template
      const first = value.split(/[\s|,]/)[0].toLowerCase();
      out.status = STATUS_VALID.has(first) ? first : 'unknown';
    }
  }
  return out;
}
