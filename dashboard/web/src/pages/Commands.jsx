import { useEffect, useRef, useState } from 'react';
import { api, streamCommand } from '../lib/api.js';

export default function Commands() {
  const [allowed, setAllowed] = useState([]);
  const [running, setRunning] = useState(null);
  const [logs, setLogs] = useState([]); // [{stream, text}]
  const [exit, setExit] = useState(null);
  const [selected, setSelected] = useState(null);
  const [argsDraft, setArgsDraft] = useState({});
  const streamRef = useRef(null);
  const logEndRef = useRef(null);

  useEffect(() => {
    api.commands().then(r => setAllowed(r.allowed)).catch(() => setAllowed([]));
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: 'end' });
  }, [logs.length]);

  function run(command) {
    const name = typeof command === 'string' ? command : command.name;
    const args = (typeof command === 'string' ? [] : (command.argsSchema || []).map((_, index) => argsDraft[`${name}:${index}`] || '').filter(Boolean));
    if (running) {
      streamRef.current?.close();
    }
    setRunning(name);
    setLogs([{ stream: 'meta', text: `disparando ${name}${args.length ? ` ${args.join(' ')}` : ''}` }]);
    setExit(null);
    const stream = streamCommand(name, { args }, {
      onStart: (meta) => setLogs(l => [...l, { stream: 'meta', text: `cmd: ${meta.cmd} ${meta.args.join(' ')}` }]),
      onStdout: (line) => setLogs(l => [...l, { stream: 'stdout', text: line }]),
      onStderr: (line) => setLogs(l => [...l, { stream: 'stderr', text: line }]),
      onExit: (e) => {
        setExit(e);
        setLogs(l => [...l, { stream: 'meta', text: `■ exit code=${e.code}${e.aborted ? ' (aborted)' : ''}` }]);
        setRunning(null);
      },
      onError: (err) => {
        setLogs(l => [...l, { stream: 'stderr', text: `client error: ${err.message}` }]);
        setRunning(null);
      },
    });
    streamRef.current = stream;
  }

  function cancel() {
    streamRef.current?.close();
    setRunning(null);
    setLogs(l => [...l, { stream: 'meta', text: '✕ cancelado pelo client' }]);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Comandos</h2>
        {running && (
          <button type="button" className="btn" onClick={cancel}>Cancelar {running}</button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        <div className="space-y-2">
          {allowed.map(c => (
            <button
              key={c.name}
              type="button"
              className={`btn w-full justify-start flex-col items-start gap-0.5 py-2 ${running === c.name ? 'btn-primary' : ''}`}
              disabled={!!running && running !== c.name}
              onClick={() => setSelected(c)}
            >
              <span className="font-mono text-sm">{c.name}</span>
              <span className="text-[10px] text-slate-500 font-normal text-left">{c.description}</span>
            </button>
          ))}
        </div>

        <div className="space-y-3 min-w-0">
          <div className="card space-y-3">
            {!selected && <p className="text-slate-500 text-sm">Selecione um comando para revisar input e executar.</p>}
            {selected && (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{selected.name}</h3>
                    <p className="text-xs text-slate-500">{selected.description}</p>
                  </div>
                  <span className="badge badge-approved">{selected.acceptsArgs ? 'com args' : 'sem args'}</span>
                </div>
                {selected.acceptsArgs && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
                    {(selected.argsSchema || []).map((label, index) => (
                      <label key={label} className="block">
                        <span className="block text-xs uppercase text-slate-400 mb-1">{label}</span>
                        <input
                          className="input font-mono"
                          value={argsDraft[`${selected.name}:${index}`] || ''}
                          onChange={event => setArgsDraft(prev => ({ ...prev, [`${selected.name}:${index}`]: event.target.value }))}
                          placeholder={label}
                        />
                      </label>
                    ))}
                  </div>
                )}
                <button type="button" className="btn btn-primary" onClick={() => run(selected)} disabled={!!running}>
                  {running === selected.name ? 'Executando...' : 'Executar'}
                </button>
              </>
            )}
          </div>

          <div className="card font-mono text-xs h-[420px] overflow-auto bg-bg/80">
            {logs.length === 0 && (
              <p className="text-slate-500">A saída do comando aparece aqui em tempo real.</p>
            )}
            {logs.map((l, i) => (
              <div key={i} className={lineClass(l.stream)}>
                {l.stream === 'stderr' ? '! ' : l.stream === 'meta' ? '$ ' : '  '}{l.text}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>

      {exit && (
        <p className={`text-xs ${exit.code === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
          última execução: exit code {exit.code}{exit.signal ? ` (signal ${exit.signal})` : ''}
        </p>
      )}
    </div>
  );
}

function lineClass(stream) {
  switch (stream) {
    case 'stderr': return 'text-rose-400 whitespace-pre-wrap';
    case 'meta': return 'text-slate-500 whitespace-pre-wrap';
    default: return 'text-slate-200 whitespace-pre-wrap';
  }
}
