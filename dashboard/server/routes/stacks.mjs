import fs from 'node:fs';
import path from 'node:path';
import { syncUniversal } from '../lib/repo-sync.mjs';
import { publish } from '../lib/events.mjs';
import { getProjectsDir, initWorkspace } from '../../../lib/workspace.mjs';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

function slugify(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}

function listBoilerplates(repoRoot) {
  const roots = ['boilerplates', 'templates', 'starter-kits'];
  const out = [];
  for (const rootName of roots) {
    const dir = path.join(repoRoot, rootName);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() && !entry.isFile()) continue;
      const abs = path.join(dir, entry.name);
      const rel = path.relative(repoRoot, abs);
      let description = '';
      const readme = entry.isDirectory() ? path.join(abs, 'README.md') : abs;
      if (fs.existsSync(readme) && readme.endsWith('.md')) {
        const raw = fs.readFileSync(readme, 'utf8');
        description = raw.split('\n').find(line => line.trim() && !line.startsWith('#')) || '';
      }
      out.push({ name: entry.name.replace(/\.(md|json)$/i, ''), path: rel, type: entry.isDirectory() ? 'dir' : 'file', description });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function listDesignReferences(repoRoot) {
  const dir = path.join(repoRoot, 'design-md');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const readme = path.join(dir, entry.name, 'README.md');
      let description = '';
      if (fs.existsSync(readme)) {
        const raw = fs.readFileSync(readme, 'utf8');
        description = raw.split('\n').find(line => line.trim() && !line.startsWith('#')) || '';
      }
      return { name: entry.name, path: path.relative(repoRoot, readme), description };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function suggestStack({ projectType = '', constraints = '', developerPreference = '' }) {
  const text = `${projectType} ${constraints} ${developerPreference}`.toLowerCase();
  const isDashboard = /dashboard|admin|crm|saas|painel|kanban/.test(text);
  const isApi = /api|backend|microservice|serviço/.test(text);
  const isMobile = /mobile|app|react native|expo/.test(text);
  const frontend = isMobile ? 'Expo + React Native' : isDashboard ? 'React + Vite + Tailwind' : 'Next.js';
  const backend = isApi || isDashboard ? 'Node.js + Fastify' : 'Next.js API routes';
  const data = /relacional|financeiro|tenant|b2b|audit/.test(text) ? 'PostgreSQL + Prisma' : 'SQLite dev, PostgreSQL prod';
  return {
    frontend,
    backend,
    data,
    auth: /empresa|b2b|multi-tenant|tenant/.test(text) ? 'Auth.js/Entra ID por tenant' : 'Auth.js simples',
    testing: 'Vitest + Playwright smoke',
    deploy: 'Docker + Azure Container Apps',
    rationale: 'Sugestão gerada por heurística local a partir do tipo de projeto, restrições e preferência do dev.',
  };
}

function renderStackDoc({ projectSlug, aiSuggestion, developerStack, selectedBoilerplate, designSystem, notes }) {
  const now = new Date().toISOString();
  return `# Stack do Projeto

- **Projeto**: ${projectSlug}
- **Atualizado em**: ${now}

## Sugestão da IA por adaptação

${Object.entries(aiSuggestion).map(([key, value]) => `- **${key}**: ${value}`).join('\n')}

## Sugestão do desenvolvedor por conveniência/uso

${developerStack || '- Não definida'}

## Boilerplate selecionado

${selectedBoilerplate || '- Nenhum'}

## Design system aprovado

- **Referência design-md**: ${designSystem?.reference || '- Não definida'}
- **Superfície**: ${designSystem?.surface || '-'}
- **Fonte principal**: ${designSystem?.fontPrimary || '-'}
- **Fonte mono**: ${designSystem?.fontMono || '-'}
- **Cores**: ${designSystem?.colors || '-'}
- **Logo/brand asset**: ${designSystem?.logo || '-'}
- **Tom visual**: ${designSystem?.tone || '-'}

### Notas de design

${designSystem?.notes || '-'}

## Notas

${notes || '-'}
`;
}

function renderDesignBrief({ projectSlug, designSystem }) {
  const colors = String(designSystem?.colors || '')
    .split(',')
    .map(color => color.trim())
    .filter(Boolean);
  return `# Design Brief: ${projectSlug}

- **Feature/superficie**: ${designSystem?.surface || 'agent-console'}
- **Persona principal**: Operador do framework de agentes
- **Objetivo da UI**: Executar o fluxo SDD/GSD com clareza, baixa friccao e leitura rapida de estado.
- **Referencia primaria**: design-md/${designSystem?.reference || 'vercel'}/README.md
- **Logo/brand asset**: ${designSystem?.logo || 'Agent Dashboard tipografico'}

## Principios aplicados

- Minimalismo tecnico inspirado em Vercel.
- Alta densidade sem cards aninhados.
- Estados e gates sempre visiveis antes de executar comandos.
- Tokens fora do fluxo operacional principal.

## Tokens visuais

- **Fonte principal**: ${designSystem?.fontPrimary || 'Geist'}
- **Fonte mono**: ${designSystem?.fontMono || 'Geist Mono'}
- **Cores**: ${colors.join(', ') || '#000000, #050505, #262626, #ffffff, #a3a3a3'}
- **Tom**: ${designSystem?.tone || 'minimal, tecnico, preciso'}

## Componentes esperados

- Sidebar compacta.
- Cards planos com borda fina.
- Badges de estado discretos.
- Terminal no browser para execucoes.
- Paineis de gates por projeto.

## Estados obrigatorios

- loading, vazio, erro, running, blocked, review, done, archived.

## Criterios de aceite visual

- Texto nao estoura em mobile ou desktop.
- Workflow principal cabe sem pagina monstruosa.
- Design brief, stack e gates ficam legiveis antes da implementacao.
- Cores e fonte aprovadas aparecem no frontend.

## Notas

${designSystem?.notes || '-'}
`;
}

export default async function stacksRoutes(app, { repoRoot }) {
  app.get('/api/stacks/boilerplates', async () => listBoilerplates(repoRoot));
  app.get('/api/stacks/design-references', async () => listDesignReferences(repoRoot));

  app.post('/api/stacks/suggest', async (req) => ({
    suggestion: suggestStack(req.body || {}),
    boilerplates: listBoilerplates(repoRoot),
  }));

  app.post('/api/stacks/:project', async (req, reply) => {
    const projectSlug = slugify(req.params.project);
    if (!SLUG_RE.test(projectSlug)) return reply.code(400).send({ error: 'invalid project', code: 'INVALID_PROJECT' });
    initWorkspace();
    const projectDir = path.join(getProjectsDir(), projectSlug);
    fs.mkdirSync(path.join(projectDir, 'memory/20-architecture'), { recursive: true });
    const aiSuggestion = req.body?.aiSuggestion || suggestStack(req.body || {});
    const developerStack = String(req.body?.developerStack || '').trim();
    const selectedBoilerplate = String(req.body?.selectedBoilerplate || '').trim();
    const designSystem = req.body?.designSystem || {};
    const notes = String(req.body?.notes || '').trim();
    const file = path.join(projectDir, 'memory/20-architecture/stack.md');
    const designBriefFile = path.join(projectDir, 'memory/20-architecture/design-brief.md');
    fs.writeFileSync(file, renderStackDoc({ projectSlug, aiSuggestion, developerStack, selectedBoilerplate, designSystem, notes }), 'utf8');
    fs.writeFileSync(designBriefFile, renderDesignBrief({ projectSlug, designSystem }), 'utf8');
    publish('stack.updated', { projectSlug });
    const sync = await syncUniversal(repoRoot, `stack:${projectSlug}`, { projectSlug });
    return {
      path: path.relative(repoRoot, file),
      designBriefPath: path.relative(repoRoot, designBriefFile),
      aiSuggestion,
      developerStack,
      selectedBoilerplate,
      designSystem,
      notes,
      sync: { code: sync.code, source: sync.source },
    };
  });
}
