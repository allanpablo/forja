# Spec: llm-contexto-e-sessoes — `llm:run --engineer` e `llm:sessions`

- **ID**: SPEC-048
- **Status**: approved
- **Owner**: apk
- **Criado em**: 2026-09-08
- **Sprint alvo**: <a definir>
- **ADRs relacionadas**: nenhuma — extensão dos contratos de SPEC-028/029/ADR-0081; nenhuma
  decisão estrutural. Read-only default preservado.
- **Origem**: `docs/roadmap-v4.1.md`, Onda 4 (W10). Fecha os pontos C2 e C5 do diagnóstico.

## 1. Problema

**C2 — montar contexto para o `llm:run` é manual.** Hoje o operador escolhe arquivos à mão
(`--context a.md --context b.md`). O façade `engineer` já compõe o pacote certo — contexto
mínimo do domínio + ADRs relevantes + `architecture:check` + risco + agentes recomendados +
incidentes parecidos + fluxo — mas **não alimenta o `llm:run`**. Quem quer o melhor contexto
roda `engineer` num terminal, copia, e cola no `--task`.

**C5 — não há como listar sessões.** `llm:run --resume SESSION_ID` retoma uma sessão Codex, mas
o `SESSION_ID` só aparece na saída JSON da execução anterior. `llm_session` guarda os metadados
(id, cwd, fingerprint do perfil, observação vinculada), e **nada os expõe**. Quem perdeu o
terminal anterior não retoma.

**Como medimos hoje**: `grep -rn "llm:sessions" .` → nada. `llm:run` só aceita `--context`.

## 2. Proposta de valor

`llm:run --engineer "<objetivo>"` monta o contexto pelo façade e o envia — hash cobrindo o
prompt transmitido, **sem persistir o conteúdo** (só a referência). `llm:sessions list|show`
torna as sessões retomáveis descobríveis. O agente para de reconstruir contexto na mão e não
perde mais uma sessão por fechar um terminal.

## 3. User stories

- **Como** operador do `llm:run`, **quero** `--engineer "<objetivo>"` no lugar de escolher
  arquivos, **para que** o modelo receba o pacote que o `engineer` já sabe montar.
- **Como** operador que fechou o terminal, **quero** `forja llm:sessions` listando as sessões
  Codex retomáveis (id, projeto, quando), **para que** eu recupere o `SESSION_ID` do `--resume`.
- **Como** auditor, **quero** `llm:sessions show <id>` ligando a sessão à observação e à
  validação registradas, **para que** eu veja o histórico sem abrir o SQLite.

## 4. Critérios de aceite (Definition of Done)

- [ ] **AC-1**: `forja llm:run --profile <p> --engineer "<objetivo>"` roda `forja engineer
      "<objetivo>" --json` num subprocesso, embute o relatório no prompt (mesmo mecanismo de
      `buildContextPrompt`: bloco rotulado + JSON), e envia. `--engineer` e `--prompt`/`--task`
      combinam (o objetivo pode ser o próprio prompt); `--engineer` e `--context` também combinam.
- [ ] **AC-2**: o `inputHash` (`sha256`) cobre o **prompt final transmitido**, incluindo o bloco
      do `engineer`. `contextRefs` da observação ganha uma entrada `engineer:<objetivo>` — a
      **referência**, nunca o conteúdo do relatório. `llm_validation`/`Observation` continuam sem
      texto.
- [ ] **AC-3**: se `forja engineer --json` falhar (exit ≠ 0), `llm:run --engineer` **falha antes
      de chamar o provedor** com `errorCode: 'ENGINEER_FAILED'` e a primeira linha do stderr do
      façade — nunca envia um prompt sem o contexto que foi pedido.
- [ ] **AC-4**: `forja llm:sessions list` — lista as sessões de `llm_session` (id, cwd/projeto,
      `updatedAt`, `observationId`), mais recentes primeiro. `--json` emite um array.
- [ ] **AC-5**: `forja llm:sessions show <id>` — a sessão + resumo da observação vinculada
      (`model`, `outcome`, `validationStatus`, `durationMs`) e da `llm_validation` (`status`,
      nomes dos checks). `id` desconhecido → exit 1 com mensagem clara. `--json` emite um objeto.
- [ ] **AC-6**: `llm:sessions` é **somente leitura** — nenhuma escrita em `llm_session` nem no
      recorder; `gates: ['workspace']` (precisa do banco), sem gate de rede.
- [ ] **AC-7**: registry — `llm:run.desc` menciona `--engineer`; entrada `llm:sessions` nova
      (`tier` não; `domain: 'llm'`; `readonly: true`; `json: true`). `docs/llm-fit-loop.md`
      documenta os dois.
- [ ] **AC-8**: `lib/llm/session.ts` `LlmSessionStore` ganha `all()` e `find(id)` (leitura pura,
      sem `assertBinding`); `lib/llm/context.ts` ganha o builder do bloco `engineer` (ou fica em
      `llm-fit.ts` se menor) — testável sem provedor.
- [ ] **AC-9**: `tsc --noEmit`, `node --test test/*.test.js`, `forja spec:check`,
      `forja project:check` verdes. Testes de `llm:run`/sessão existentes inalterados.

## 5. Escopo

**Dentro**:
- `scripts/llm-fit.ts` — flag `--engineer` no `run()`; subcomando `sessions` (list/show).
- `lib/llm/session.ts` — `all()` / `find(id)`.
- `lib/llm/context.ts` — builder do bloco `engineer` a partir do JSON do façade (subprocesso).
- `lib/core/registry.ts` — `llm:sessions`; desc de `llm:run`.
- `docs/llm-fit-loop.md`; testes.

**Fora** (evita scope creep):
- Importar a lógica do `engineer` in-process — fica subprocesso (`forja engineer --json`), sem
  refatorar `scripts/engineer.ts`.
- Passar `--ref`/`--role` do `engineer` por dentro do `--engineer` — usa os defaults do façade
  nesta rodada; flags dedicadas são backlog.
- `llm:sessions delete`/`prune` — leitura só; limpeza é outra spec.
- Retomada automática ("continuar a última sessão") — o `--resume` continua exigindo o ID
  explícito (ADR-0081).
- Adaptador não-Codex de sessão — `llm_session` segue Codex-only (ADR-0081).

## 6. NFRs / restrições

- **Privacidade**: o relatório do `engineer` pode conter dados do projeto — entra no prompt
  transmitido e no hash, **nunca** no banco. Igual ao `--context` de hoje (`docs/llm-fit-loop.md`).
- **Compatibilidade**: `llm:run` sem `--engineer` inalterado; `--resume`, schema, checks intactos.
- **Performance**: `--engineer` adiciona um `forja engineer` (~1–2 s de bootstrap de grafo/sqlite)
  antes da chamada ao provedor — desprezível vs. a latência do modelo.
- **Segurança**: `llm:sessions` não abre o provedor nem a rede; só lê o SQLite do workspace.

## 7. Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Relatório do `engineer` estoura o contexto do modelo | M | M | AC-3 não trunca silenciosamente; o operador vê o tamanho no `stdout`; truncar/resumir é backlog |
| `forja engineer --json` sai 0 mas com relatório degradado (grafo vazio) | M | B | AC-1 embute o que vier; o relatório já sinaliza suas próprias lacunas |
| `llm:sessions show` acopla ao schema interno de `Observation`/`llm_validation` | B | M | `show` lê pelos campos públicos já expostos na saída do `llm:run`, com fallback "indisponível" |
| `--engineer` + `--context` + schema → prompt gigante e ordem confusa | B | B | Ordem fixa: prompt → bloco engineer → contextos → instrução de schema; documentada |

## 8. Métricas de sucesso

30 dias, baseline sobre `forja-runs.jsonl` (a flag `--engineer` já é auditada):

- Adoção: `llm:run --engineer` aparece como fração das execuções de `llm:run`.
- `llm:sessions` aparece em `forja-runs.jsonl` — alguém usou para recuperar um `SESSION_ID`.
- Zero regressão nos testes de `llm:run`/sessão.

## Evidências e estado real

- AC-1 a AC-9 → tasks em `spec:tasks`.
- **Sem mudança de contrato**: `llm:run` ganha um caminho de entrada; a saída JSON e os exit
  codes seguem iguais. `errorCode: 'ENGINEER_FAILED'` é aditivo.
- **Hipótese, não medição**: as métricas de §8 dependem de adoção real; sem instrumentação
  dedicada além da flag auditada.
- **Dependência**: independente das Ondas 1–3; branch a partir de `main`. Usa `forja engineer`
  (SPEC-035) e `llm_session` (ADR-0081), ambos já em `main`.
