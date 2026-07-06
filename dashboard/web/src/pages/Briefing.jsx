import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export default function Briefing() {
  const navigate = useNavigate();
  const [brief, setBrief] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [projectHint, setProjectHint] = useState('');
  const [projects, setProjects] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    api.projects().then(p => setProjects(p)).catch(() => setProjects([]));
  }, []);

  // auto-slug a partir da primeira linha do brief
  useEffect(() => {
    if (slugTouched) return;
    const firstLine = brief.split('\n').find(l => l.trim());
    if (firstLine) {
      const proposed = slugify(firstLine.slice(0, 50));
      if (proposed.length >= 2) setSlug(proposed);
    }
  }, [brief, slugTouched]);

  const slugValid = SLUG_RE.test(slug);
  const briefValid = brief.trim().length >= 20;
  const canSubmit = slugValid && briefValid && !submitting;

  async function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.briefing({ brief, slug, projectHint: projectHint || undefined });
      setPreview(res);
      // pequena pausa para mostrar parsed antes de redirecionar
      setTimeout(() => navigate('/specs'), 1200);
    } catch (err) {
      setError(err.detail?.error || err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h2 className="text-xl font-semibold">Briefing → Spec</h2>
        <p className="text-slate-400 text-sm">
          Descreva a feature em texto livre. O parser heurístico extrai problema, valor e user stories — você revisa e ajusta no editor.
        </p>
      </div>

      <form onSubmit={submit} className="card space-y-4">
        <div>
          <label className="block text-xs uppercase text-slate-400 mb-1">Briefing</label>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={12}
            placeholder={`Exemplo:

O problema hoje é que ninguém vê quanto cada projeto consome de tokens.

Queremos um painel que mostre o consumo agregado em tempo quase-real.

Como autor, quero ver gráfico 30d, para que eu detecte gargalo.
Como dev, quero clicar nos comandos principais, para que eu não memorize a CLI.`}
            className="w-full bg-bg border border-border rounded p-3 text-sm font-mono leading-relaxed"
          />
          <p className="text-[10px] text-slate-500 mt-1">
            {brief.length} chars · {briefValid ? '✓' : 'mínimo 20'} · dicas: comece com "Hoje…" para o problema, use "Como X, quero Y, para que Z" para stories
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs uppercase text-slate-400 mb-1">Slug (kebab-case)</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }}
              placeholder="ex: agent-dashboard"
              className="w-full bg-bg border border-border rounded p-2 text-sm font-mono"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              {slug ? (slugValid ? '✓' : '✗ inválido (2-64 chars, a-z0-9-)') : 'sugerido a partir do brief'}
            </p>
          </div>

          <div>
            <label className="block text-xs uppercase text-slate-400 mb-1">Projeto-alvo (opcional)</label>
            <select
              value={projectHint}
              onChange={(e) => setProjectHint(e.target.value)}
              className="w-full bg-bg border border-border rounded p-2 text-sm"
            >
              <option value="">— framework —</option>
              {projects.map(p => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="text-rose-300 text-sm border border-rose-700 rounded p-2 bg-rose-950/30">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-[10px] text-slate-500">
            Spec é criada em status <code className="text-accent">draft</code>. Você revisa antes de mover para <code className="text-accent">review</code>.
          </p>
          <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
            {submitting ? 'Gerando…' : 'Gerar spec'}
          </button>
        </div>
      </form>

      {preview && (
        <div className="card space-y-2 border-emerald-700">
          <h3 className="font-semibold text-emerald-300">✓ Criada: {preview.slug}</h3>
          <p className="text-xs text-slate-400">{preview.specPath} · redirecionando…</p>
          <details>
            <summary className="cursor-pointer text-xs text-slate-400">parsed</summary>
            <pre className="text-[10px] mt-2 whitespace-pre-wrap">{JSON.stringify(preview.parsed, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  );
}
