import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const DESIGN_PRESETS = {
  vercel: {
    reference: 'vercel',
    surface: 'agent-console',
    fontPrimary: 'Geist',
    fontMono: 'Geist Mono',
    colors: '#000000, #050505, #171717, #262626, #FFFFFF, #A3A3A3',
    logo: 'Logo tipografico simples da empresa',
    tone: 'minimal, tecnico, preciso, denso',
    notes: 'Sidebar compacta, cards planos, borda fina, estados discretos e leitura rápida.',
  },
  graphite: {
    reference: 'vercel',
    surface: 'dashboard',
    fontPrimary: 'Geist',
    fontMono: 'Geist Mono',
    colors: '#0A0A0A, #111111, #1F1F1F, #2A2A2A, #EDEDED, #8B8B8B',
    logo: 'Marca tipografica monocromatica',
    tone: 'operacional, limpo, confiavel',
    notes: 'Pouca cor, foco em status, ações sempre visíveis e contraste alto.',
  },
};

export default function Stack() {
  const [projects, setProjects] = useState([]);
  const [boilerplates, setBoilerplates] = useState([]);
  const [designReferences, setDesignReferences] = useState([]);
  const [project, setProject] = useState('');
  const [projectType, setProjectType] = useState('');
  const [constraints, setConstraints] = useState('');
  const [developerStack, setDeveloperStack] = useState('');
  const [selectedBoilerplate, setSelectedBoilerplate] = useState('');
  const [designSystem, setDesignSystem] = useState({
    reference: 'vercel',
    surface: 'agent-console',
    fontPrimary: 'Geist',
    fontMono: 'Geist Mono',
    colors: '#000000, #050505, #262626, #ffffff, #a3a3a3',
    logo: 'Logo tipografico simples da empresa',
    tone: 'minimal, tecnico, preciso, denso',
    notes: 'Sidebar compacta, cards planos, borda fina, estados discretos e leitura rápida.',
  });
  const [notes, setNotes] = useState('');
  const [suggestion, setSuggestion] = useState(null);
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.projects().then(setProjects).catch(() => setProjects([]));
    api.boilerplates().then(setBoilerplates).catch(() => setBoilerplates([]));
    api.designReferences().then(setDesignReferences).catch(() => setDesignReferences([]));
  }, []);

  async function suggest(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.suggestStack({ projectType, constraints, developerPreference: developerStack });
      setSuggestion(res.suggestion);
      setBoilerplates(res.boilerplates || []);
    } catch (err) {
      setError(err.detail?.error || err.message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!project) return;
    setBusy(true);
    setError(null);
    try {
      setSaved(await api.saveStack(project, {
        aiSuggestion: suggestion,
        developerStack,
        selectedBoilerplate,
        designSystem,
        notes,
        projectType,
        constraints,
      }));
    } catch (err) {
      setError(err.detail?.error || err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-4">
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Stack Definition</h2>
          <p className="text-sm text-slate-400">Compare adaptação sugerida pela IA com conveniência/padrão do desenvolvedor e salve em Markdown indexado no SQLite.</p>
        </div>

        <form className="card space-y-3" onSubmit={suggest}>
          <Field label="Projeto">
            <select className="input" value={project} onChange={event => setProject(event.target.value)}>
              <option value="">Selecione...</option>
              {projects.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Tipo de projeto">
            <input className="input" value={projectType} onChange={event => setProjectType(event.target.value)} placeholder="dashboard SaaS, API B2B, app mobile..." />
          </Field>
          <Field label="Restrições/adaptação">
            <textarea className="input min-h-24" value={constraints} onChange={event => setConstraints(event.target.value)} placeholder="multi-tenant, LGPD, realtime, baixo custo, offline..." />
          </Field>
          <Field label="Stack do desenvolvedor por conveniência">
            <textarea className="input min-h-24 font-mono" value={developerStack} onChange={event => setDeveloperStack(event.target.value)} placeholder="ex: NestJS + Prisma + Postgres; React + Tailwind; Docker..." />
          </Field>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Gerando...' : 'Gerar sugestão IA'}</button>
        </form>

        <div className="card space-y-2">
          <h3 className="font-semibold text-sm">Boilerplates detectados</h3>
          <select className="input" value={selectedBoilerplate} onChange={event => setSelectedBoilerplate(event.target.value)}>
            <option value="">Nenhum</option>
            {boilerplates.map(b => <option key={b.path} value={b.path}>{b.path}</option>)}
          </select>
          {boilerplates.length === 0 && <p className="text-xs text-slate-500">Crie uma pasta `boilerplates/`, `templates/` ou `starter-kits/` na raiz para aparecer aqui.</p>}
        </div>

        <DesignSystemPanel
          value={designSystem}
          references={designReferences}
          onChange={setDesignSystem}
          onApplyPreset={(name) => setDesignSystem(DESIGN_PRESETS[name] || DESIGN_PRESETS.vercel)}
        />
      </section>

      <section className="space-y-4">
        {error && <div className="card border-rose-700 text-rose-300">{error}</div>}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <article className="card space-y-3">
            <h3 className="font-semibold">Sugestão da IA por adaptação</h3>
            {!suggestion && <p className="text-sm text-slate-500">Gere uma sugestão a partir do contexto.</p>}
            {suggestion && (
              <div className="space-y-2">
                {Object.entries(suggestion).map(([key, value]) => (
                  <div key={key} className="border border-border rounded p-2">
                    <div className="text-[10px] uppercase text-slate-500">{key}</div>
                    <div className="text-sm text-slate-200">{value}</div>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="card space-y-3">
            <h3 className="font-semibold">Escolha do desenvolvedor por uso</h3>
            <pre className="bg-bg/80 border border-border rounded p-3 whitespace-pre-wrap text-xs font-mono min-h-40">{developerStack || 'Nenhuma preferência informada.'}</pre>
            <Field label="Notas de decisão">
              <textarea className="input min-h-28" value={notes} onChange={event => setNotes(event.target.value)} placeholder="tradeoffs, motivo do boilerplate, dívidas aceitas..." />
            </Field>
            <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !project}>{busy ? 'Salvando...' : 'Salvar stack do projeto'}</button>
          </article>

          <article className="card space-y-3">
            <h3 className="font-semibold">Design-md aprovado para o front</h3>
            <div className="space-y-2 text-sm">
              <PreviewRow label="Referência" value={designSystem.reference} />
              <PreviewRow label="Superfície" value={designSystem.surface} />
              <PreviewRow label="Fontes" value={`${designSystem.fontPrimary} / ${designSystem.fontMono}`} />
              <PreviewRow label="Logo" value={designSystem.logo || 'Não definido'} />
              <div className="flex flex-wrap gap-2">
                {designSystem.colors.split(',').map(color => color.trim()).filter(Boolean).map(color => (
                  <span key={color} className="inline-flex items-center gap-1 text-xs text-slate-300">
                    <span className="h-4 w-4 rounded border border-border" style={{ background: color }} />
                    <code>{color}</code>
                  </span>
                ))}
              </div>
              <pre className="bg-bg/80 border border-border rounded p-3 whitespace-pre-wrap text-xs">{designBriefCommand(designSystem)}</pre>
            </div>
          </article>
        </div>

        <article className="card space-y-3">
          <h3 className="font-semibold">O que você deve inputar</h3>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 text-sm">
            <GuideItem label="Referência" value="vercel" detail="A referência visual principal do projeto." />
            <GuideItem label="Superfície" value="agent-console" detail="A tela que vai ser desenhada agora." />
            <GuideItem label="Fontes" value="Geist / Geist Mono" detail="Uma fonte para leitura e outra para dados e comandos." />
            <GuideItem label="Cores" value="#000000, #050505, #262626, #ffffff, #a3a3a3" detail="Preto, quase preto, borda fina, branco e cinza de apoio." />
            <GuideItem label="Logo" value="Logo tipografico simples" detail="Preferência por marca limpa, sem ícone pesado." />
            <GuideItem label="Tom" value="minimal, tecnico, preciso, denso" detail="Pouca ornamentação, muita informação útil." />
          </div>
        </article>

        {saved && (
          <div className="card border-emerald-700">
            <h3 className="font-semibold text-emerald-300">Stack salva</h3>
            <p className="text-sm text-slate-400">{saved.path} · sync code {saved.sync?.code}</p>
            {saved.designBriefPath && (
              <p className="text-sm text-slate-400">Design brief gerado: <code className="text-accent">{saved.designBriefPath}</code></p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function DesignSystemPanel({ value, references, onChange, onApplyPreset }) {
  function patch(next) {
    onChange(prev => ({ ...prev, ...next }));
  }

  return (
    <div className="card space-y-3">
      <div>
        <h3 className="font-semibold text-sm">Design system do projeto</h3>
        <p className="text-xs text-slate-500">Escolha a referência design-md e registre fontes, cores e logo antes do front executar a UI.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {Object.keys(DESIGN_PRESETS).map(name => (
          <button key={name} type="button" className="btn" onClick={() => onApplyPreset(name)}>
            Preset {name}
          </button>
        ))}
      </div>
      <Field label="Referência design-md">
        <select className="input" value={value.reference} onChange={event => patch({ reference: event.target.value })}>
          {references.length === 0 && <option value={value.reference}>{value.reference}</option>}
          {references.map(ref => <option key={ref.name} value={ref.name}>{ref.name}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Superfície">
          <select className="input" value={value.surface} onChange={event => patch({ surface: event.target.value })}>
            {['agent-console', 'dashboard', 'docs', 'landing', 'tool', 'fintech', 'premium'].map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Tom visual">
          <input className="input" value={value.tone} onChange={event => patch({ tone: event.target.value })} placeholder="operacional, premium, minimal..." />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Fonte principal">
          <input className="input" value={value.fontPrimary} onChange={event => patch({ fontPrimary: event.target.value })} />
        </Field>
        <Field label="Fonte mono">
          <input className="input" value={value.fontMono} onChange={event => patch({ fontMono: event.target.value })} />
        </Field>
      </div>
      <Field label="Cores/tokens">
        <input className="input font-mono" value={value.colors} onChange={event => patch({ colors: event.target.value })} placeholder="#0f172a, #38bdf8..." />
      </Field>
      <Field label="Logo da empresa">
        <input className="input" value={value.logo} onChange={event => patch({ logo: event.target.value })} placeholder="URL, caminho ou descrição do asset" />
      </Field>
      <Field label="Notas de aplicação no frontend">
        <textarea className="input min-h-20" value={value.notes} onChange={event => patch({ notes: event.target.value })} placeholder="densidade, componentes, estados, restrições da marca..." />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        {value.colors.split(',').map(color => color.trim()).filter(Boolean).map(color => (
          <div key={color} className="flex items-center gap-2 border border-border rounded p-2 bg-bg/50">
            <span className="h-5 w-5 rounded-sm border border-border" style={{ background: color }} />
            <code className="text-[10px] text-slate-300">{color}</code>
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewRow({ label, value }) {
  return (
    <div className="border border-border rounded p-2 bg-bg/50">
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
      <div className="text-slate-200">{value}</div>
    </div>
  );
}

function GuideItem({ label, value, detail }) {
  return (
    <div className="border border-border rounded p-3 bg-bg/50 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase text-slate-500">{label}</span>
        <code className="text-xs text-slate-300">{value}</code>
      </div>
      <p className="text-xs text-slate-400">{detail}</p>
    </div>
  );
}

function designBriefCommand(value) {
  return [
    'Próximos comandos:',
    `npm run design:select -- ${value.surface} "${value.tone}"`,
    'npm run design:check -- design-md/BRIEF-TEMPLATE.md',
    '',
    `Referência escolhida: design-md/${value.reference}/README.md`,
  ].join('\n');
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase text-slate-400 mb-1">{label}</span>
      {children}
    </label>
  );
}
