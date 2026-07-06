import { useEffect, useRef, useState } from 'react';
import { api, streamCommand, streamWorkflowRun } from '../lib/api.js';
import Badge from '../components/Badge.jsx';

const STATUSES = ['todo', 'running', 'blocked', 'review', 'done'];
export default function Workflow() {
  const [projects, setProjects] = useState([]);
  const [routing, setRouting] = useState(null);
  const [workflow, setWorkflow] = useState(null);
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedStepId, setSelectedStepId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.projects().then(setProjects).catch(() => setProjects([]));
    api.llmRouting().then(setRouting).catch(() => setRouting(null));
  }, []);

  async function loadWorkflow(slug) {
    setSelectedProject(slug);
    setWorkflow(null);
    setSelectedStepId(null);
    setError(null);
    setBusy(true);
    try {
      let loaded;
      try {
        loaded = await api.workflow(slug);
      } catch (err) {
        if (err.status !== 404) throw err;
        loaded = await api.initWorkflowProject(slug);
      }
      setWorkflow(loaded);
      setSelectedStepId(firstActiveStepId(loaded));
    }
    catch (err) { setError(err.detail?.error || err.message); }
    finally { setBusy(false); }
  }

  async function updateStep(stepId, payload) {
    if (!workflow) return;
    const res = await api.updateWorkflowStep(workflow.projectSlug, stepId, payload);
    setWorkflow(await api.workflow(workflow.projectSlug));
    return res;
  }

  async function addComment(payload) {
    if (!workflow) return;
    await api.addWorkflowComment(workflow.projectSlug, payload);
    setWorkflow(await api.workflow(workflow.projectSlug));
  }

  async function playDevelopment() {
    if (!workflow) return;
    setBusy(true);
    setError(null);
    try {
      await api.playDevelopment(workflow.projectSlug);
      const loaded = await api.workflow(workflow.projectSlug);
      setWorkflow(loaded);
      setSelectedStepId('implement');
    } catch (err) {
      setError(err.detail?.error || err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 2xl:grid-cols-[340px_1fr] gap-4">
      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">Workflow de Projeto</h2>
        <p className="text-sm text-slate-400">Selecione um projeto existente. O workflow executa GSD, briefing, estrutura, sprints, contexto, spec, design, plan, desenvolvimento, validação e governança.</p>
        </div>

        <div className="card space-y-2">
          <h3 className="font-semibold text-sm">Projetos existentes</h3>
          <p className="text-xs text-slate-500">Ao selecionar, o workflow é carregado. Se ainda não existir, ele é criado a partir do projeto e do Briefing sugerido.</p>
          <div className="space-y-1 max-h-80 overflow-auto">
            {projects.map(project => (
              <button
                key={project.name}
                type="button"
                className={`w-full text-left border border-border rounded px-3 py-2 text-sm hover:bg-slate-900/50 ${selectedProject === project.name ? 'bg-slate-900/70' : ''}`}
                onClick={() => loadWorkflow(project.name)}
              >
                <span className="font-mono text-accent">{project.name}</span>
                <span className="text-slate-500 text-xs ml-2">{project.specs_total || 0} specs</span>
              </button>
            ))}
          </div>
        </div>

        <details className="card text-xs text-slate-400">
          <summary className="cursor-pointer font-semibold text-sm text-slate-200">LLMs roteadas</summary>
          <div className="pt-2">
            <pre className="whitespace-pre-wrap">{JSON.stringify(routing?.assignments || {}, null, 2)}</pre>
          </div>
        </details>
      </section>

      <section className="space-y-3 min-w-0">
        {!workflow && <div className="card text-slate-500 text-sm">Inicie ou selecione um projeto para visualizar os dados.</div>}
        {busy && <div className="card text-slate-400 text-sm">Carregando workflow do projeto…</div>}
        {workflow && (
          <>
            <WorkflowHeader workflow={workflow} />
            <PlayPanel workflow={workflow} busy={busy} onPlay={playDevelopment} />
            <SchemaRail workflow={workflow} />
            <BrowserTerminal
              workflow={workflow}
              selectedStepId={selectedStepId}
              onSelectStep={setSelectedStepId}
              onUpdate={updateStep}
              onDone={() => loadWorkflow(workflow.projectSlug)}
            />
            <SprintPanel workflow={workflow} onSave={addComment} />
          </>
        )}
      </section>
    </div>
  );
}

function PlayPanel({ workflow, busy, onPlay }) {
  const implement = (workflow.kanban || []).find(step => step.id === 'implement');
  return (
    <div className="card flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
      <div>
        <h3 className="font-semibold">Orquestracao de desenvolvimento</h3>
        <p className="text-xs text-slate-500">
          Status: <span className="font-mono">{implement?.status || 'todo'}</span> · specs/{workflow.projectSlug}/tasks.md
        </p>
      </div>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={onPlay}>
        {busy ? 'Iniciando...' : 'Play desenvolvimento'}
      </button>
    </div>
  );
}

function WorkflowHeader({ workflow }) {
  return (
    <div className="card flex items-start justify-between gap-4">
      <div>
        <h3 className="text-lg font-semibold">{workflow.projectName}</h3>
        <code className="text-xs text-slate-500">projects/{workflow.projectSlug}</code>
      </div>
      <div className="text-right text-xs text-slate-500">
        <div>{new Date(workflow.updatedAt).toLocaleString('pt-BR')}</div>
        <div>{workflow.files?.brief}</div>
      </div>
    </div>
  );
}

function SchemaRail({ workflow }) {
  const ordered = orderedSteps(workflow);
  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Ordem do schema operacional</h3>
        <code className="text-xs text-slate-500 hidden lg:block">gsd → briefing → estrutura → sprints → contexto → spec → design → plan → desenvolvimento → validação → governança</code>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {ordered.map((step, index) => (
          <div key={step.id} className="border border-border rounded p-2 bg-bg/60 min-h-24 min-w-44">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[10px] text-slate-500 font-mono">#{index + 1}</span>
              <Badge status={step.status}>{step.status}</Badge>
            </div>
            <div className="mt-2 text-sm font-medium leading-tight">{step.title}</div>
            <div className="mt-1 text-[10px] text-slate-500 font-mono">{step.role}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CommandsPanel({ workflow, commands, onRefresh }) {
  return (
    <div className="card space-y-3">
      <h3 className="font-semibold">Linhas de comando por LLM</h3>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {commands.map(command => (
          <div key={command.role} className="border border-border rounded p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-accent">{command.role}</span>
              <span className="badge badge-approved">{command.provider}{command.model ? `/${command.model}` : ''}</span>
            </div>
            <pre className="bg-bg/80 border border-border rounded p-2 whitespace-pre-wrap text-xs font-mono">{command.commandLine}</pre>
            <TerminalRunner workflow={workflow} command={command} step="implement" onDone={onRefresh} defaultOpen={false} />
          </div>
        ))}
      </div>
    </div>
  );
}

function StepBoard({ workflow, selectedStepId, onSelectStep, onUpdate }) {
  const ordered = orderedSteps(workflow);
  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Steps de execução</h3>
        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
          {STATUSES.map(status => (
            <span key={status}><span className="font-mono">{status}</span>: {ordered.filter(k => k.status === status).length}</span>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        {ordered.map(item => (
          <StepCard
            key={item.id}
            item={item}
            projectSlug={workflow.projectSlug}
            selected={selectedStepId === item.id}
            onSelect={() => onSelectStep(item.id)}
            onUpdate={onUpdate}
          />
        ))}
      </div>
    </div>
  );
}

function StepCard({ item, projectSlug, selected, onSelect, onUpdate }) {
  const [status, setStatus] = useState(item.status);
  const [details, setDetails] = useState(item.details || '');
  const [llmReturn, setLlmReturn] = useState(item.llmReturn || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStatus(item.status);
    setDetails(item.details || '');
    setLlmReturn(item.llmReturn || '');
  }, [item.id, item.status, item.details, item.llmReturn]);

  async function save() {
    setBusy(true);
    try { await onUpdate(item.id, { status, details, llmReturn }); }
    finally { setBusy(false); }
  }

  return (
    <div className={`border rounded p-3 bg-bg/60 space-y-3 ${selected ? 'border-accent' : 'border-border'}`}>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_150px] gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500 font-mono">#{item.order || '?'}</span>
            <h4 className="font-medium text-sm">{item.title}</h4>
          </div>
          <p className="text-[10px] text-slate-500 font-mono">{item.id} · {item.role}</p>
        </div>
        <div className="flex lg:justify-end items-start">
          <Badge status={item.status}>{item.status}</Badge>
        </div>
      </div>
      {item.schemaCommand && (
        <pre className="bg-bg/80 border border-border rounded p-2 whitespace-pre-wrap text-[10px] font-mono text-slate-400">{item.schemaCommand}</pre>
      )}
      {item.action && (
        <pre className="bg-bg/80 border border-border rounded p-2 whitespace-pre-wrap text-[10px] font-mono text-emerald-300">{formatStepAction(item.action, projectSlug)}</pre>
      )}
      <div className="flex flex-wrap gap-2">
        <select className="input max-w-44" value={status} onChange={event => setStatus(event.target.value)}>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Salvando...' : 'Salvar step'}</button>
        <button type="button" className="btn" onClick={onSelect}>{selected ? 'No terminal' : 'Abrir no terminal'}</button>
      </div>
    </div>
  );
}

function orderedSteps(workflow) {
  return [...(workflow.kanban || [])].sort((a, b) => {
    const orderA = Number.isFinite(a.order) ? a.order : 999;
    const orderB = Number.isFinite(b.order) ? b.order : 999;
    return orderA - orderB || String(a.id).localeCompare(String(b.id));
  });
}

function firstStepId(workflow) {
  return orderedSteps(workflow)[0]?.id || null;
}

function firstActiveStepId(workflow) {
  const ordered = orderedSteps(workflow);
  return ordered.find(step => step.status !== 'done')?.id || ordered[0]?.id || null;
}

function defaultStepPrompt(workflow, step) {
  return [
    `Projeto: ${workflow.projectName}`,
    `Step ${step.order}: ${step.title}`,
    `Papel: ${step.role}`,
    `Status atual: ${step.status}`,
    '',
    'Entrada esperada:',
    step.schemaCommand || '-',
    '',
    'Acao executavel:',
    formatStepAction(resolveStepAction(step, workflow), workflow.projectSlug),
    '',
    'Contexto/observacoes:',
    step.details || '-',
  ].join('\n');
}

function resolveStepAction(step, workflow) {
  if (!step?.action) return null;
  const keyword = step.id === 'context' ? `${workflow.projectSlug} sprint atual` : '';
  const goal = workflow.sprintGoal || workflow.projectName || workflow.projectSlug;
  return {
    command: step.action.command,
    args: (step.action.args || []).map(arg => String(arg)
      .replace('<slug>', workflow.projectSlug)
      .replace('<project>', workflow.projectSlug)
      .replace('<objetivo>', goal)
      .replace('<keyword>', keyword)
    ),
  };
}

function formatStepAction(action, projectSlug = '') {
  if (!action?.command) return '-';
  const args = (action.args || []).map(arg => String(arg)
    .replace('<slug>', projectSlug)
    .replace('<project>', projectSlug)
  );
  return [action.command, ...args].filter(Boolean).join(' ');
}

function BrowserTerminal({ workflow, selectedStepId, onSelectStep, onUpdate, onDone }) {
  const ordered = orderedSteps(workflow);
  const selectedStep = ordered.find(step => step.id === selectedStepId) || ordered[0];
  const command = selectedStep ? (workflow.commands || []).find(item => item.role === selectedStep.role) || (workflow.commands || [])[0] : null;
  const [status, setStatus] = useState(selectedStep?.status || 'todo');
  const [details, setDetails] = useState(selectedStep?.details || '');
  const [llmReturn, setLlmReturn] = useState(selectedStep?.llmReturn || '');
  const [prompt, setPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [actionRunning, setActionRunning] = useState(false);
  const [logs, setLogs] = useState([]);
  const streamRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!selectedStep) return;
    setStatus(selectedStep.status || 'todo');
    setDetails(selectedStep.details || '');
    setLlmReturn(selectedStep.llmReturn || '');
    setPrompt(defaultStepPrompt(workflow, selectedStep));
  }, [workflow.projectSlug, selectedStep?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [logs.length]);

  async function save() {
    if (!selectedStep) return;
    await onUpdate(selectedStep.id, { status, details, llmReturn });
  }

  function run() {
    if (!command || !selectedStep) return;
    streamRef.current?.close();
    setRunning(true);
    setLogs([{ stream: 'meta', text: `step ${selectedStep.order}: ${selectedStep.id}` }, { stream: 'meta', text: `executando ${command.role} via ${command.provider}` }]);
    streamRef.current = streamWorkflowRun(workflow.projectSlug, command.role, { step: selectedStep.id, prompt }, {
      onStart: meta => setLogs(l => [...l, { stream: 'meta', text: `${meta.cmd} ${(meta.args || []).join(' ')}` }]),
      onStdout: line => setLogs(l => [...l, { stream: 'stdout', text: line }]),
      onStderr: line => setLogs(l => [...l, { stream: 'stderr', text: line }]),
      onExit: e => {
        setLogs(l => [...l, { stream: 'meta', text: `exit code=${e.code} status=${e.status || '-'}` }]);
        setRunning(false);
        onDone?.();
      },
      onError: err => {
        setLogs(l => [...l, { stream: 'stderr', text: err.message }]);
        setRunning(false);
      },
    });
  }

  function runAction() {
    const action = resolveStepAction(selectedStep, workflow);
    if (!action?.command) return;
    streamRef.current?.close();
    setActionRunning(true);
    setLogs([{ stream: 'meta', text: `fase ${selectedStep.order}: ${selectedStep.id}` }, { stream: 'meta', text: `executando ${action.command} ${(action.args || []).join(' ')}` }]);
    streamRef.current = streamCommand(action.command, { args: action.args || [] }, {
      onStart: meta => setLogs(l => [...l, { stream: 'meta', text: `${meta.cmd} ${(meta.args || []).join(' ')}` }]),
      onStdout: line => setLogs(l => [...l, { stream: 'stdout', text: line }]),
      onStderr: line => setLogs(l => [...l, { stream: 'stderr', text: line }]),
      onExit: async e => {
        const nextStatus = e.code === 0 ? 'done' : 'blocked';
        setLogs(l => [...l, { stream: 'meta', text: `exit code=${e.code} status=${nextStatus}` }]);
        setActionRunning(false);
        setStatus(nextStatus);
        await onUpdate(selectedStep.id, {
          status: nextStatus,
          details: `Ação ${action.command} finalizada com code=${e.code}.`,
          llmReturn,
        });
        onDone?.();
      },
      onError: err => {
        setLogs(l => [...l, { stream: 'stderr', text: err.message }]);
        setActionRunning(false);
      },
    });
  }

  function cancel() {
    streamRef.current?.close();
    setRunning(false);
    setActionRunning(false);
    setLogs(l => [...l, { stream: 'meta', text: 'cancelado no client' }]);
  }

  if (!selectedStep) {
    return <div className="card text-slate-500 text-sm">Nenhum step disponível para execução.</div>;
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Terminal no browser</h3>
          <p className="text-xs text-slate-500 font-mono">
            #{selectedStep.order} {selectedStep.id} · {selectedStep.role} · {command ? `${command.provider}${command.model ? `/${command.model}` : ''}` : 'sem comando'}
          </p>
        </div>
        <Badge status={status}>{status}</Badge>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-3">
        <div className="space-y-2">
          <Field label="Step selecionado">
            <select className="input font-mono" value={selectedStep.id} onChange={event => onSelectStep(event.target.value)}>
              {ordered.map(step => (
                <option key={step.id} value={step.id}>#{step.order} {step.id}</option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select className="input font-mono" value={status} onChange={event => setStatus(event.target.value)}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Comando sugerido">
            <pre className="bg-bg/80 border border-border rounded p-2 whitespace-pre-wrap text-[11px] font-mono text-slate-400 min-h-16">{selectedStep.schemaCommand || '-'}</pre>
          </Field>
          <Field label="Ação executável">
            <pre className="bg-bg/80 border border-border rounded p-2 whitespace-pre-wrap text-[11px] font-mono text-emerald-300 min-h-16">{formatStepAction(resolveStepAction(selectedStep, workflow), workflow.projectSlug)}</pre>
          </Field>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={run} disabled={running || !command}>Rodar</button>
            <button type="button" className="btn" onClick={runAction} disabled={running || actionRunning || !resolveStepAction(selectedStep, workflow)?.command}>
              {actionRunning ? 'Executando...' : 'Executar fase'}
            </button>
            <button type="button" className="btn" onClick={save} disabled={running || actionRunning}>Salvar inputs</button>
            {(running || actionRunning) && <button type="button" className="btn" onClick={cancel}>Cancelar</button>}
          </div>
        </div>

        <div className="space-y-2">
          <Field label="Prompt enviado para execução">
            <textarea
              className="input min-h-28 font-mono"
              value={prompt}
              onChange={event => setPrompt(event.target.value)}
              placeholder="Prompt complementar para esta execução"
            />
          </Field>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            <Field label="Detalhes do step">
              <textarea className="input min-h-28" value={details} onChange={event => setDetails(event.target.value)} placeholder="Detalhes operacionais" />
            </Field>
            <Field label="Retorno/validação manual">
              <textarea className="input min-h-28 font-mono" value={llmReturn} onChange={event => setLlmReturn(event.target.value)} placeholder="Cole aqui o retorno da LLM ou evidência de validação" />
            </Field>
          </div>
        </div>
      </div>

      <div className="bg-bg/90 border border-border rounded h-72 overflow-auto p-3 font-mono text-xs">
        {logs.length === 0 && <p className="text-slate-500">Terminal aberto. Selecione um step, revise os inputs e clique em Rodar.</p>}
        {logs.map((log, index) => (
          <div key={index} className={terminalClass(log.stream)}>
            {log.stream === 'stderr' ? '! ' : log.stream === 'meta' ? '$ ' : '  '}{log.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function TerminalRunner({ workflow, command, step, onDone, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [prompt, setPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState([]);
  const streamRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [logs.length]);

  function run() {
    if (!command) return;
    streamRef.current?.close();
    setOpen(true);
    setRunning(true);
    setLogs([{ stream: 'meta', text: `executando ${command.role} via ${command.provider}` }]);
    streamRef.current = streamWorkflowRun(workflow.projectSlug, command.role, { step, prompt }, {
      onStart: meta => setLogs(l => [...l, { stream: 'meta', text: `${meta.cmd} ${(meta.args || []).join(' ')}` }]),
      onStdout: line => setLogs(l => [...l, { stream: 'stdout', text: line }]),
      onStderr: line => setLogs(l => [...l, { stream: 'stderr', text: line }]),
      onExit: e => {
        setLogs(l => [...l, { stream: 'meta', text: `exit code=${e.code} status=${e.status || '-'}` }]);
        setRunning(false);
        onDone?.();
      },
      onError: err => {
        setLogs(l => [...l, { stream: 'stderr', text: err.message }]);
        setRunning(false);
      },
    });
  }

  function cancel() {
    streamRef.current?.close();
    setRunning(false);
    setLogs(l => [...l, { stream: 'meta', text: 'cancelado no client' }]);
  }

  return (
    <div className="space-y-2">
      <textarea
        className="input min-h-16"
        value={prompt}
        onChange={event => setPrompt(event.target.value)}
        placeholder="Prompt complementar para esta execução"
      />
      <div className="flex gap-2">
        <button type="button" className="btn btn-primary" onClick={run} disabled={running || !command}>Rodar no terminal</button>
        {running && <button type="button" className="btn" onClick={cancel}>Cancelar</button>}
        <button type="button" className="btn" onClick={() => setOpen(!open)}>{open ? 'Ocultar terminal' : 'Ver terminal'}</button>
      </div>
      {open && (
        <div className="bg-bg/90 border border-border rounded h-64 overflow-auto p-3 font-mono text-xs">
          {logs.length === 0 && <p className="text-slate-500">Sem execução ainda.</p>}
          {logs.map((log, index) => (
            <div key={index} className={terminalClass(log.stream)}>
              {log.stream === 'stderr' ? '! ' : log.stream === 'meta' ? '$ ' : '  '}{log.text}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}

function terminalClass(stream) {
  if (stream === 'stderr') return 'text-rose-400 whitespace-pre-wrap';
  if (stream === 'meta') return 'text-slate-500 whitespace-pre-wrap';
  return 'text-slate-200 whitespace-pre-wrap';
}

function SprintPanel({ workflow, onSave }) {
  const [comment, setComment] = useState('');
  const [nextSprintDetails, setNextSprintDetails] = useState(workflow.nextSprintDetails || '');
  const [busy, setBusy] = useState(false);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await onSave({ comment, nextSprintDetails });
      setComment('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="card space-y-3">
      <summary className="cursor-pointer font-semibold">Sprint prevista e comentários</summary>
      <form className="space-y-2" onSubmit={save}>
        <textarea className="input min-h-24" value={nextSprintDetails} onChange={event => setNextSprintDetails(event.target.value)} placeholder="Detalhes da próxima sprint" />
        <textarea className="input min-h-20" value={comment} onChange={event => setComment(event.target.value)} placeholder="Comentário ou decisão adicional" />
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Salvando...' : 'Adicionar detalhe'}</button>
      </form>
      <div className="space-y-2">
        {(workflow.comments || []).map(c => (
          <div key={c.at} className="border border-border rounded p-2 text-sm">
            <div className="text-[10px] text-slate-500">{new Date(c.at).toLocaleString('pt-BR')}</div>
            <p className="text-slate-300">{c.comment}</p>
          </div>
        ))}
      </div>
    </details>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase text-slate-400 mb-1">{label}</span>
      {children}
    </label>
  );
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}
