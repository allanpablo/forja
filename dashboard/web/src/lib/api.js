/**
 * Cliente fino para a API do dashboard.
 * Em dev, Vite proxy /api → 127.0.0.1:7777 (vite.config.js).
 * Em prod, Fastify serve / e /api do mesmo host.
 */

async function req(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    let detail = await res.text().catch(() => '');
    try { detail = JSON.parse(detail); } catch { /* keep text */ }
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    err.detail = detail;
    throw err;
  }
  return res.json();
}

export const api = {
  health: () => req('/api/health'),
  systemOverview: () => req('/api/system/overview'),
  specs: () => req('/api/specs'),
  spec: (slug) => req(`/api/specs/${encodeURIComponent(slug)}`),
  setSpecStatus: (slug, stage, status) =>
    req(`/api/specs/${encodeURIComponent(slug)}/status`, {
      method: 'POST', body: JSON.stringify({ stage, status }),
    }),
  generateSpecStage: (slug, stage) =>
    req(`/api/specs/${encodeURIComponent(slug)}/generate/${encodeURIComponent(stage)}`, {
      method: 'POST', body: JSON.stringify({}),
    }),
  handoffs: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return req(`/api/handoffs${q ? '?' + q : ''}`);
  },
  transitionHandoff: (id, to) =>
    req(`/api/handoffs/${id}/transition`, { method: 'POST', body: JSON.stringify({ to }) }),
  projects: () => req('/api/projects'),
  setProjectStatus: (project, status) =>
    req(`/api/projects/${encodeURIComponent(project)}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  setProjectNotes: (project, notes) =>
    req(`/api/projects/${encodeURIComponent(project)}/notes`, { method: 'POST', body: JSON.stringify({ notes }) }),
  tokens: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return req(`/api/tokens${q ? '?' + q : ''}`);
  },
  commands: () => req('/api/commands'),
  agents: () => req('/api/agents'),
  agent: (name) => req(`/api/agents/${encodeURIComponent(name)}`),
  docs: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return req(`/api/docs${q ? '?' + q : ''}`);
  },
  doc: (path) => req(`/api/docs/read?${new URLSearchParams({ path }).toString()}`),
  memoryStats: () => req('/api/memory/stats'),
  memorySearch: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return req(`/api/memory/search${q ? '?' + q : ''}`);
  },
  memoryNode: (id) => req(`/api/memory/nodes/${encodeURIComponent(id)}`),
  functions: () => req('/api/functions'),
  llmRouting: () => req('/api/llm-routing'),
  setLlmRouting: (role, payload) =>
    req(`/api/llm-routing/${encodeURIComponent(role)}`, { method: 'POST', body: JSON.stringify(payload) }),
  startWorkflowProject: (payload) =>
    req('/api/workflow/start-project', { method: 'POST', body: JSON.stringify(payload) }),
  initWorkflowProject: (project) =>
    req(`/api/workflow/${encodeURIComponent(project)}/init`, { method: 'POST', body: JSON.stringify({}) }),
  workflow: (project) => req(`/api/workflow/${encodeURIComponent(project)}`),
  updateWorkflowStep: (project, step, payload) =>
    req(`/api/workflow/${encodeURIComponent(project)}/kanban/${encodeURIComponent(step)}`, { method: 'POST', body: JSON.stringify(payload) }),
  addWorkflowComment: (project, payload) =>
    req(`/api/workflow/${encodeURIComponent(project)}/comments`, { method: 'POST', body: JSON.stringify(payload) }),
  playDevelopment: (project) =>
    req(`/api/workflow/${encodeURIComponent(project)}/play-development`, { method: 'POST', body: JSON.stringify({}) }),
  boilerplates: () => req('/api/stacks/boilerplates'),
  designReferences: () => req('/api/stacks/design-references'),
  suggestStack: (payload) =>
    req('/api/stacks/suggest', { method: 'POST', body: JSON.stringify(payload) }),
  saveStack: (project, payload) =>
    req(`/api/stacks/${encodeURIComponent(project)}`, { method: 'POST', body: JSON.stringify(payload) }),
  briefing: (payload) =>
    req('/api/briefing', { method: 'POST', body: JSON.stringify(payload) }),
};

/**
 * Wrapper de SSE para /api/commands/:name.
 * Retorna { close } + dispara handlers passados.
 */
export function streamCommand(name, payload = {}, { onStart, onStdout, onStderr, onExit, onError } = {}) {
  if (typeof payload === 'function' || payload?.onStart || payload?.onStdout) {
    // Compatibilidade com chamadas antigas: streamCommand(name, handlers)
    return streamCommand(name, {}, payload);
  }
  // POST não suporta EventSource nativamente — usamos fetch + reader.
  const controller = new AbortController();
  (async () => {
    try {
      const res = await fetch(`/api/commands/${encodeURIComponent(name)}`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Accept': 'text/event-stream', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        onError?.(new Error(body.error || `HTTP ${res.status}`));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop();
        for (const block of blocks) {
          const m = block.match(/event: ([^\n]+)\n([\s\S]*)$/);
          if (!m) continue;
          const event = m[1];
          const data = m[2].split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6)).join('\n');
          if (event === 'start') onStart?.(safeJson(data));
          else if (event === 'stdout') onStdout?.(data);
          else if (event === 'stderr') onStderr?.(data);
          else if (event === 'exit') onExit?.(safeJson(data));
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') onError?.(err);
    }
  })();
  return { close: () => controller.abort() };
}

export function streamWorkflowRun(project, role, payload, { onStart, onStdout, onStderr, onExit, onError } = {}) {
  const controller = new AbortController();
  (async () => {
    try {
      const res = await fetch(`/api/workflow/${encodeURIComponent(project)}/run/${encodeURIComponent(role)}`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Accept': 'text/event-stream', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        onError?.(new Error(body.error || `HTTP ${res.status}`));
        return;
      }
      await consumeSse(res, { onStart, onStdout, onStderr, onExit });
    } catch (err) {
      if (err.name !== 'AbortError') onError?.(err);
    }
  })();
  return { close: () => controller.abort() };
}

async function consumeSse(res, { onStart, onStdout, onStderr, onExit }) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop();
    for (const block of blocks) {
      const m = block.match(/event: ([^\n]+)\n([\s\S]*)$/);
      if (!m) continue;
      const event = m[1];
      const data = m[2].split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6)).join('\n');
      if (event === 'start') onStart?.(safeJson(data));
      else if (event === 'stdout') onStdout?.(data);
      else if (event === 'stderr') onStderr?.(data);
      else if (event === 'exit') onExit?.(safeJson(data));
    }
  }
}

function safeJson(s) { try { return JSON.parse(s); } catch { return s; } }
