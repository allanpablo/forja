import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { readRouting } from '../lib/llm-routing.mjs';
import { getWorkspaceDbPath, initWorkspace } from '../../../lib/workspace.mjs';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

function safeRead(file) {
  try { return fs.readFileSync(file, 'utf8'); }
  catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };
  const meta = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    meta[m[1]] = m[2].trim();
  }
  return { meta, body: match[2] };
}

function firstSection(body, heading) {
  const re = new RegExp(`##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, 'i');
  const match = body.match(re);
  return match ? match[1].trim() : '';
}

function handoffCounts() {
  initWorkspace();
  const dbPath = getWorkspaceDbPath();
  if (!fs.existsSync(dbPath)) return new Map();
  const db = new Database(dbPath, { readonly: true, timeout: 5000 });
  db.pragma('busy_timeout = 5000');
  try {
    const rows = db.prepare(`
      SELECT to_agent AS agent, status, COUNT(*) AS total
      FROM handoffs
      GROUP BY to_agent, status
    `).all();
    const counts = new Map();
    for (const row of rows) {
      const current = counts.get(row.agent) || { open: 0, in_progress: 0, done: 0, cancelled: 0, archived: 0, total: 0 };
      current[row.status] = row.total;
      current.total += row.total;
      current.active = (current.open || 0) + (current.in_progress || 0);
      counts.set(row.agent, current);
    }
    return counts;
  } finally {
    db.close();
  }
}

function loadAgent(repoRoot, name, counts, routing) {
  const claudePath = path.join(repoRoot, '.claude', 'agents', `${name}.md`);
  const content = safeRead(claudePath);
  if (!content) return null;
  const { meta, body } = parseFrontmatter(content);
  const promptPath = path.join(repoRoot, 'prompts', `${name}-agent.md`);
  const prompt = safeRead(promptPath);
  const handoffs = counts.get(name) || { open: 0, in_progress: 0, done: 0, cancelled: 0, archived: 0, active: 0, total: 0 };
  return {
    name: meta.name || name,
    slug: name,
    description: meta.description || '',
    tools: meta.tools ? meta.tools.split(',').map(t => t.trim()).filter(Boolean) : [],
    responsibilities: firstSection(body, 'Responsabilidades'),
    when: firstSection(body, 'Quando você atua') || firstSection(body, 'Quando'),
    whenNot: firstSection(body, 'Quando você NÃO atua') || firstSection(body, 'Quando voce NAO atua') || firstSection(body, 'Quando não atua'),
    rules: firstSection(body, 'Regras'),
    expectedOutput: firstSection(body, 'Saída esperada') || firstSection(body, 'Saida esperada'),
    handoffProtocol: firstSection(body, 'Protocolo de handoff \\(ADR-0005\\)') || firstSection(body, 'Protocolo de handoff'),
    claudePath: path.relative(repoRoot, claudePath),
    promptPath: prompt ? path.relative(repoRoot, promptPath) : null,
    promptPreview: prompt ? prompt.slice(0, 500) : null,
    llm: routing.assignments[name] || null,
    handoffs,
    content,
    prompt,
  };
}

export default async function agentsRoutes(app, { repoRoot }) {
  app.get('/api/agents', async () => {
    const dir = path.join(repoRoot, '.claude', 'agents');
    if (!fs.existsSync(dir)) return [];
    const counts = handoffCounts();
    const routing = readRouting(repoRoot);
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
      .map(entry => entry.name.replace(/\.md$/, ''))
      .sort()
      .map(name => loadAgent(repoRoot, name, counts, routing))
      .filter(Boolean)
      .map(({ content, prompt, ...agent }) => agent);
  });

  app.get('/api/agents/:name', async (req, reply) => {
    const { name } = req.params;
    if (!SLUG_RE.test(name)) return reply.code(400).send({ error: 'invalid agent', code: 'INVALID_AGENT' });
    const agent = loadAgent(repoRoot, name, handoffCounts(), readRouting(repoRoot));
    if (!agent) return reply.code(404).send({ error: 'agent not found', code: 'AGENT_NOT_FOUND' });
    return agent;
  });
}
