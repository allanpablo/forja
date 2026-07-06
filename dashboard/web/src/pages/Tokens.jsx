import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { api } from '../lib/api.js';
import { usePolling } from '../lib/usePolling.js';

const DAYS_OPTIONS = [7, 14, 30, 60, 90];
const COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb7185', '#22d3ee', '#facc15'];

export default function Tokens() {
  const [days, setDays] = useState(30);
  const fetcher = useMemo(() => () => api.tokens({ days: String(days) }), [days]);
  const { data, error, loading } = usePolling(fetcher);

  if (loading && !data) return <p className="text-slate-400 text-sm">Carregando…</p>;
  if (error) return <p className="text-rose-300">Erro: {error.message}</p>;

  const { pivoted, projects, totals } = pivot(data.series);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          Tokens <span className="text-xs text-slate-400 font-normal">({data.method}, fórmula: {data.formula})</span>
        </h2>
        <div className="flex gap-1">
          {DAYS_OPTIONS.map(d => (
            <button
              key={d}
              type="button"
              className={`btn ${days === d ? 'btn-primary' : ''}`}
              onClick={() => setDays(d)}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="card h-80">
        {pivoted.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500">
            Sem dados nos últimos {days} dias.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={pivoted}>
              <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip contentStyle={{ background: '#11161f', border: '1px solid #1f2937' }} />
              <Legend />
              {projects.map((p, i) => (
                <Line key={p} type="monotone" dataKey={p} stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={2} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold mb-3">Total estimado por projeto ({days}d)</h3>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr><th className="py-1">Projeto</th><th className="py-1 text-right">Tokens (in+out)</th></tr>
          </thead>
          <tbody>
            {totals.map((t) => (
              <tr key={t.project} className="border-t border-border">
                <td className="py-1.5 font-mono">{t.project}</td>
                <td className="py-1.5 text-right">{t.total.toLocaleString('pt-BR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-slate-500">
        Estimativa por chars/4. Não reflete o consumo real da API Anthropic — apenas o tamanho do contexto montado localmente.
      </p>
    </div>
  );
}

function pivot(series) {
  const byDate = new Map();
  const projectSet = new Set();
  const totalsByProject = new Map();
  for (const point of series) {
    projectSet.add(point.project);
    const sum = (point.tokens_in || 0) + (point.tokens_out || 0);
    totalsByProject.set(point.project, (totalsByProject.get(point.project) || 0) + sum);
    const row = byDate.get(point.date) || { date: point.date };
    row[point.project] = (row[point.project] || 0) + sum;
    byDate.set(point.date, row);
  }
  return {
    pivoted: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    projects: [...projectSet].sort(),
    totals: [...totalsByProject.entries()]
      .map(([project, total]) => ({ project, total }))
      .sort((a, b) => b.total - a.total),
  };
}
