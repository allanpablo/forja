# Spec: forja-status-caminho-feliz — "onde estou e o que faço agora?"

- **ID**: SPEC-044
- **Status**: done
- **Owner**: apk
- **Criado em**: 2026-09-07
- **Sprint alvo**: <a definir>
- **ADRs relacionadas**: nenhuma — comandos novos, somente leitura, aditivos ao registry (ADR-0020).
- **Origem**: `docs/roadmap-v4.1.md`, Onda 2 (W4).
- **Depende de**: `cli-intuitiva-v1` (SPEC-043, PR #61) — reusa `tier`/`next`/`readonly` do registry
  e o comando `forja setup`. Branch empilhada sobre `feat/cli-intuitiva-v1`.

## 1. Problema

Não existe um comando que responda **"onde estou e o que faço agora?"**. O estado do trabalho
está espalhado por cinco lugares que o operador (humano ou agente LLM) precisa consultar e cruzar
de cabeça:

- `sprint:status` — sprint atual
- `orchestrate:status` — etapa aberta / gate travado, mas só se você souber o `--slug`
- `spec:check` — specs e seus estados
- `forja-runs.jsonl` — o que foi executado por último
- tabela `handoffs` no `universal.db` — passagens em aberto

`orchestrate` é o caminho feliz (a cadeia SDD/GSD como máquina de estados guardada por gates,
SPEC-021), mas nada aponta proativamente "a etapa está verde, rode `orchestrate:advance`" ou
"o gate travou aqui". O hook SessionStart já dá um retrato parcial, mas (a) só roda no início da
sessão do Claude Code, (b) não existe como comando, (c) não diz a **próxima ação**.

**Como medimos hoje**: não há instrumentação. Evidência qualitativa: um agente que entra sem
contexto roda 4–5 comandos de orientação antes de agir.

## 2. Proposta de valor

`forja status` — um retrato único do estado (workspace, sprint, corrida orchestrate aberta +
etapa/gate, specs por status, últimos runs, handoffs). `forja next` — **uma linha**: a próxima
ação recomendada e o comando exato para executá-la. Um operador sem contexto prévio sabe o que
fazer com um comando.

## 3. User stories

- **Como** agente LLM começando uma sessão, **quero** `forja next` com a próxima ação + comando,
  **para que** eu não reconstrua o estado com cinco comandos.
- **Como** dev voltando a um projeto depois de dias, **quero** `forja status` com sprint + specs +
  corrida aberta num lugar só, **para que** eu retome contexto rápido.
- **Como** orchestrator, **quero** que `forja next` aponte `orchestrate:advance` quando há etapa
  verde esperando, ou mostre o gate travado quando vermelho.
- **Como** consumidor de automação, **quero** `forja status --json` estável, **para que** um
  script decida o próximo passo.

## 4. Critérios de aceite (Definition of Done)

- [ ] **AC-1**: `forja status` imprime, em seções rotuladas: (a) **workspace** (path, origem,
      existe?); (b) **sprint** atual ou "sem sprint"; (c) **corrida** orchestrate aberta — slug,
      etapa aberta, último veredito de gate — ou "nenhuma corrida aberta"; (d) **specs** agrupadas
      por status; (e) **últimos runs** (até 5 linhas de `forja-runs.jsonl`: cmd, exitCode,
      quando); (f) **handoffs** abertos (se a memória estiver de pé). Cada seção degrada com
      `indisponível: <motivo>` em vez de quebrar.
- [ ] **AC-2**: `forja status --json` emite objeto com chaves estáveis (`workspace`, `sprint`,
      `orchestrate`, `specs`, `recentRuns`, `handoffs`) e `status: "ok"`; nunca lança — erro de
      subsistema vira `{ available: false, reason }` naquela chave.
- [ ] **AC-3**: `forja next` imprime **uma** recomendação: rótulo curto + comando exato numa linha
      `→ forja <cmd> …`. `forja next --json` → `{ action, command, reason }`.
- [ ] **AC-4**: prioridade determinística do `forja next`:
      1. workspace ausente → `forja setup`
      2. memória não indexada → `forja sync:universal`
      3. corrida aberta com gate **vermelho** → mostra o parecer + `forja orchestrate:advance` (após corrigir)
      4. corrida aberta com etapa **pronta** → `forja orchestrate:advance`
      5. spec em `approved` sem `plan.md` → `forja spec:plan <slug>`; plan `approved` sem `tasks.md` → `forja spec:tasks <slug>`
      6. spec em `implementing` → aponta a spec + `forja spec:check <slug>`
      7. nada pendente → `forja orchestrate "<objetivo>" --slug <slug>` ou `forja spec:new <slug>`
- [ ] **AC-5**: ambos são `readonly: true`, sem gate bloqueante de workspace (`workspace-warn` no
      máximo), e não escrevem nada além da linha de auditoria padrão.
- [ ] **AC-6**: `status` e `next` entram no registry com `tier: 'core'`, `usage`, `examples`,
      `next`; `orchestrate` sobe para o topo do bloco GSD no `forja help` e ganha uma linha no
      `README.md` como caminho padrão.
- [ ] **AC-7**: reuso — `forja status` **não** reimplementa parsing de sprint/orchestrate/specs.
      `listSpecs` (hoje embutido em `scripts/hook-session-start.ts`) é extraído para `lib/` e
      compartilhado pelo hook e pelo novo comando. O estado da corrida vem de um export de
      `scripts/orchestrate.ts` (ou de `orchestrate:status --json`, criado se não existir), nunca
      de parsear o arquivo cru de `.context/`.
- [ ] **AC-8**: testes — `forja status --json` num workspace temporário vazio → todas as chaves,
      subsistemas `available:false` com `reason`, exit 0; `forja next --json` no mesmo →
      `{ action: "setup" | "sync", … }`; com fixture de spec `approved` sem plan → `forja next`
      aponta `spec:plan <slug>`.
- [ ] **AC-9**: `tsc --noEmit`, `node --test test/*.test.js`, `forja spec:check`,
      `forja project:check` verdes.

## 5. Escopo

**Dentro**:
- `scripts/forja-status.ts` (novo) — implementa `status` e `next` (subcomando por `args`).
- `lib/specs-index.ts` (novo) — `listSpecs()` extraído do hook; hook passa a importar de lá.
- Export legível de estado da corrida em `scripts/orchestrate.ts` **ou** `orchestrate:status --json`.
- Entradas `status` e `next` no registry; reordenação de `orchestrate` no bloco GSD.
- Uma linha no `README.md`; testes.

**Fora** (evita scope creep):
- `forja status --watch` / TUI — só snapshot.
- Contrato `--json` + exit codes global — Onda 2 (W5), spec própria. Aqui só o objeto destes 2 comandos.
- Dashboard / painel HTML.
- Qualquer mudança em `orchestrate` além de posição na listagem e um modo `--json` se necessário.
- Qualquer escrita de estado.

## 6. NFRs / restrições

- **Performance**: `forja status` e `forja next` < 300 ms (leitura de arquivos + 1–2 queries
  SQLite pequenas).
- **Compatibilidade**: nenhum comando existente muda de assinatura, saída ou exit code.
  `orchestrate` só muda de posição no `forja help`.
- **Segurança**: somente leitura; degrada com `indisponível: <motivo>`, nunca stack trace.
- **Observabilidade**: auditado em `forja-runs.jsonl` como qualquer comando.

## 7. Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Reconstruir estado do orchestrate lendo o arquivo interno de `.context/` acopla a formato privado | M | M | Consumir via export de `orchestrate.ts` ou `orchestrate:status --json`; não parsear cru (AC-7) |
| `forja next` recomenda ação errada em estado ambíguo | M | M | Ordem de prioridade fixa e testada (AC-4/AC-8); `forja status` sempre disponível para o humano decidir |
| Extrair `listSpecs` do hook quebra o SessionStart | B | A | Mover + reimportar; teste do hook cobre; `hook-session-start` roda no CI |
| `forja next` com nenhuma pendência vira ruído ("crie uma spec") | B | B | Passo 7 só sugere, com verbo claro de que não há nada pendente |

## 8. Métricas de sucesso

Avaliar 30 dias após o release, baseline sobre `forja-runs.jsonl` antes:

- Adoção: `forja next` / `forja status` aparecem em `forja-runs.jsonl` como comandos usados por agentes.
- Queda na sequência de comandos de orientação (`sprint:status` + `orchestrate:status` + `spec:check`
  rodados em < 2 min no início de uma sessão) — proxy de "reconstruí o estado na mão".
- Zero regressões no hook SessionStart atribuídas à extração de `listSpecs`.

## Evidências e estado real

**Implementado em 2026-09-08** na branch `feat/forja-status` (empilhada sobre `feat/cli-intuitiva-v1`).
Bateria: `tsc --noEmit` limpo; `node --test test/*.test.js` **492/492** (+13 em
`test/forja-status.test.js`); `forja spec:check` e `forja project:check` (100%) verdes.

| AC | Onde | Verificado |
|---|---|---|
| AC-1 | `scripts/forja-status.ts` `renderStatus()` | `forja status` mostra as 6 seções rotuladas; seção sem fonte → `indisponível: <reason>` |
| AC-2 | `lib/status-model.ts` `collectStatus()` + `--json` | `forja status --json` → `{ status:"ok", workspace, sprint, orchestrate, specs, recentRuns, handoffs }`; coletor em erro → `{available:false,reason}`; nunca lança (teste) |
| AC-3 | `scripts/forja-status.ts` (ramo `next`) | `forja next` → `→ forja <cmd>` + motivo; `--json` → `{action,command,reason}` |
| AC-4 | `lib/status-model.ts` `recommendNext()` | 7 ramos + ordem, testados em `test/forja-status.test.js` (pura, sem spawn) |
| AC-5 | `lib/core/registry.ts` | `status`/`next`: `readonly:true`, `json:true`, gate `workspace-warn` (não bloqueante) |
| AC-6 | `lib/core/registry.ts`, `README.md` | `forja help` lista `status`/`next` no núcleo; `status`→`next`→`orchestrate*` abrem o bloco GSD; README ganhou o bloco "Orientation" |
| AC-7 | `lib/specs-index.ts`, `lib/handoffs-index.ts`, `lib/orchestrate.ts` (`listRuns`), `scripts/hook-session-start.ts` | hook importa de `lib/`; corrida via `loadState`/`listRuns`; smoke do hook sem regressão (Specs ativas + Handoffs presentes) |
| AC-8 | `test/forja-status.test.js` | 13 testes verdes |
| AC-9 | — | bateria acima verde |

- **Decisões do plan aplicadas**: um único `scripts/forja-status.ts` para os dois comandos (D1);
  `listSpecs`/`openHandoffs` extraídos para `lib/`, hook reimporta (D2); estado da corrida via
  `loadState` + `listRuns` novo, sem `orchestrate:status --json` (D3); `lib/sprint-index.ts` novo
  em vez de reusar `sprint-manager.ts` (D4). Nenhum desvio vs. o plan.
- **`SpecEntry` ganhou `plan`/`tasks`** (status de cada artefato) para a escada da AC-4 — o hook
  só usa `slug`/`status`, sem impacto.
- **Hipótese, não medição**: os ganhos de §8 dependem de instrumentação inexistente; baseline antes.
- **Pendências**: revisão de Governança sobre o diff; handoff `review` registrado; depende do
  merge de #61 (SPEC-043).
