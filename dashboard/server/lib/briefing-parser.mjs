/**
 * briefing-parser — heurística texto → seções de spec.md.
 *
 * Sem LLM (D5). Estratégia:
 *  - Split por linhas em branco (parágrafos)
 *  - Classifica cada parágrafo por keyword: problema | valor | story | outros
 *  - "Como <persona>, quero <ação>, para que <benefício>" vira user story
 *  - Primeira frase com "problema/dor/hoje" → §1 Problema
 *  - Primeira frase com "queremos/proposta/valor" → §2 Valor
 *
 * Resultado: { problem, value, stories[] }. Tudo o que sobrar entra como "notes".
 */

const STORY_RE = /como\s+([^,;]+?),?\s+quero\s+(.+?)(?:,?\s+para\s+que\s+(.+))?[.;\n]?$/i;

const PROBLEM_KEYWORDS = /\b(problema|dor|hoje|atualmente|falta|sem|n[ãa]o\s+temos|n[ãa]o\s+conseguimos)\b/i;
const VALUE_KEYWORDS = /\b(queremos|proposta|valor|objetivo|para que|ganho|benef[ií]cio|imagine)\b/i;
const STORY_KEYWORDS = /\bcomo\s+\w/i;

function splitParagraphs(text) {
  return text
    .split(/\n\s*\n/)
    .map(s => s.trim())
    .filter(Boolean);
}

function pickFirst(paragraphs, predicate) {
  for (const p of paragraphs) if (predicate(p)) return p;
  return null;
}

function extractStories(paragraphs) {
  const stories = [];
  for (const p of paragraphs) {
    // múltiplas stories podem estar coladas — split por ". Como "
    const candidates = p.split(/(?<=[.;])\s+(?=como\s+)/i);
    for (const c of candidates) {
      const m = c.match(STORY_RE);
      if (m) {
        stories.push({
          persona: m[1].trim(),
          action: m[2].trim(),
          benefit: (m[3] || '').trim() || null,
        });
      }
    }
  }
  return stories;
}

export function parseBriefing(text) {
  const paragraphs = splitParagraphs(text || '');
  const stories = extractStories(paragraphs);

  const problem = pickFirst(paragraphs, p => PROBLEM_KEYWORDS.test(p) && !STORY_RE.test(p));
  const value = pickFirst(paragraphs, p => VALUE_KEYWORDS.test(p) && !STORY_RE.test(p) && p !== problem);

  const usedSet = new Set([problem, value].filter(Boolean));
  const notes = paragraphs.filter(p => !usedSet.has(p) && !STORY_KEYWORDS.test(p));

  return {
    problem: problem || null,
    value: value || null,
    stories,
    notes,
  };
}

export function renderSections(parsed) {
  const lines = [];
  lines.push('## 1. Problema');
  lines.push(parsed.problem || '_(não detectado pelo briefing — preencher)_');
  lines.push('');
  lines.push('## 2. Proposta de valor');
  lines.push(parsed.value || '_(não detectado pelo briefing — preencher)_');
  lines.push('');
  lines.push('## 3. User stories');
  if (parsed.stories.length) {
    for (const s of parsed.stories) {
      const benefit = s.benefit ? `, **para que** ${s.benefit}` : '';
      lines.push(`- **Como** ${s.persona}, **quero** ${s.action}${benefit}`);
    }
  } else {
    lines.push('- **Como** _(persona)_, **quero** _(ação)_, **para que** _(benefício)_');
  }
  if (parsed.notes.length) {
    lines.push('');
    lines.push('> **Notas do briefing original** (revisar e remover):');
    for (const n of parsed.notes) lines.push(`> ${n.replace(/\n/g, '\n> ')}`);
  }
  return lines.join('\n');
}
