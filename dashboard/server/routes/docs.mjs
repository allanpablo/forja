import fs from 'node:fs';
import path from 'node:path';

const ALLOWED_ROOTS = ['docs', 'memory', 'prompts'];
const MAX_DOC_BYTES = 250_000;

function walk(dir, repoRoot, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, repoRoot, out);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const stat = fs.statSync(abs);
      const rel = path.relative(repoRoot, abs);
      const raw = fs.readFileSync(abs, 'utf8');
      const title = raw.match(/^#\s+(.+)$/m)?.[1]?.trim() || path.basename(entry.name, '.md');
      out.push({
        path: rel,
        root: rel.split(path.sep)[0],
        section: rel.split(path.sep).slice(1, -1).join('/') || 'raiz',
        title,
        bytes: stat.size,
        updatedAt: stat.mtime.toISOString(),
      });
    }
  }
  return out;
}

function isSafeDocPath(repoRoot, relPath) {
  if (!relPath || path.isAbsolute(relPath)) return false;
  const normalized = path.normalize(relPath);
  if (normalized.startsWith('..') || normalized.includes(`${path.sep}..${path.sep}`)) return false;
  if (!ALLOWED_ROOTS.includes(normalized.split(path.sep)[0])) return false;
  const abs = path.resolve(repoRoot, normalized);
  return abs.startsWith(repoRoot + path.sep) && abs.endsWith('.md');
}

export default async function docsRoutes(app, { repoRoot }) {
  app.get('/api/docs', async (req) => {
    const root = req.query?.root;
    const includeArchive = req.query?.archive === '1';
    const roots = root && ALLOWED_ROOTS.includes(root) ? [root] : ALLOWED_ROOTS;
    return roots
      .flatMap(r => walk(path.join(repoRoot, r), repoRoot))
      .filter(doc => includeArchive || !doc.path.includes(`${path.sep}archive${path.sep}`))
      .sort((a, b) => a.path.localeCompare(b.path));
  });

  app.get('/api/docs/read', async (req, reply) => {
    const relPath = String(req.query?.path || '');
    if (!isSafeDocPath(repoRoot, relPath)) {
      return reply.code(400).send({ error: 'invalid path', code: 'INVALID_PATH' });
    }
    const abs = path.resolve(repoRoot, path.normalize(relPath));
    if (!fs.existsSync(abs)) return reply.code(404).send({ error: 'doc not found', code: 'DOC_NOT_FOUND' });
    const stat = fs.statSync(abs);
    if (stat.size > MAX_DOC_BYTES) return reply.code(413).send({ error: 'doc too large', code: 'DOC_TOO_LARGE' });
    const content = fs.readFileSync(abs, 'utf8');
    return {
      path: path.relative(repoRoot, abs),
      title: content.match(/^#\s+(.+)$/m)?.[1]?.trim() || path.basename(abs, '.md'),
      updatedAt: stat.mtime.toISOString(),
      content,
    };
  });
}
