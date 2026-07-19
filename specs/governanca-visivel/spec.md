# Spec: governanca-visivel

- **ID**: SPEC-014
- **Status**: done
- **Owner**: apk
- **Criado em**: 2026-07-18
- **Sprint alvo**: S?
- **ADRs relacionadas**: [ADR-0020](../../memory/90-decisions/0020-forja-core-cli-unica.md) (core/registry + auditoria), [ADR-0022](../../memory/90-decisions/0022-congelar-dashboard-web.md) (dashboard congelado), [ADR-0009](../../memory/90-decisions/0009-claude-hooks-token-economy.md) (economia de tokens), [ADR-0002](../../memory/90-decisions/0002-sqlite-fts5-busca.md) (SQLite FTS5)

## 1. Problema

O core grava **toda execução** em `.context/forja-runs.jsonl` (ADR-0020): comando, args, exit code,
duração, timestamp. São 255 runs registrados hoje. É o dado mais rico de governança que o framework
tem — a resposta viva para *"o processo foi seguido? o que rodou? o que reprovou? quanto custou?"*.

E é **write-only.** Nada lê. Para responder "quantas vezes o `release:check` reprovou este mês" ou
"qual gate está mais lento", alguém abre um `.jsonl` de 255 linhas e conta na mão. O dado existe e é
inerte — a mesma classe do problema que a sessão inteira atacou (conhecimento que existe mas não é
consultável vira conhecimento morto).

E há uma segunda ausência: o Forja **não tem superfície visual**. A tentativa anterior (SPEC-002) foi
**congelada** (ADR-0022) — mas não por ser visual, e sim por ser um **servidor** com rotas que
*executam* processos (`POST .../run/:role`): virou passivo de manutenção e de segurança. A lição não
é "sem visual"; é "sem servidor, sem execução". Um artefato **estático, gerado por comando**, de
leitura, não repete o erro — é a mesma natureza do `project:dashboard` (que já gera um relatório),
só que sobre governança e legível de relance.

## 2. Proposta de valor

A trilha de auditoria deixa de ser um arquivo que ninguém abre: vira **consultável** por comando, e
**visível** num painel de governança **estático e gerado** — leitura, sem servidor (a lição do
ADR-0022). "O processo foi seguido?" passa a ter resposta de relance, do dado real.

## 3. User stories

- **Como** governança, **quero** consultar a auditoria por comando/gate/período, **para que**
  "quantas vezes o `release:check` reprovou" seja uma query, não uma contagem manual.
- **Como** operador, **quero** um painel de relance com o estado dos gates, do pipeline SDD e da
  atividade recente, **para que** eu veja a saúde do framework sem ler dez arquivos.
- **Como** quem opera vários projetos, **quero** que o painel seja um **artefato gerado** (HTML
  estático, sem servidor), **para que** eu não reintroduza o passivo que congelou o dashboard antigo.
- **Como** agente, **quero** ler o resumo da auditoria em vez do `.jsonl` cru, **para que** eu gaste
  menos tokens entendendo o que já rodou.

## 4. Critérios de aceite (Definition of Done)

- [x] AC-1: **Ingest** — um comando (`audit:sync`) lê `.context/forja-runs.jsonl` (a fonte de verdade
      append-only) e o projeta numa tabela SQLite consultável no workspace. Idempotente: rodar duas
      vezes não duplica.
- [x] AC-2: **Query** — `audit:query` responde por comando, gate, exit code e janela de tempo
      (ex.: `--since 7d`, `--cmd release:check`, `--failed`). Saída legível + contagem.
- [x] AC-3: **Painel gerado** — um comando gera um **HTML estático e self-contained** (CSS/JS
      inline, zero asset externo) com: estado dos gates, quadro do pipeline SDD (specs × stages),
      atividade recente da auditoria (últimos runs, reprovações, gates mais lentos) e as métricas
      (comandos, testes, ADRs).
- [x] AC-4: **Sem servidor, leitura, gerado** (ADR-0022): o painel é um arquivo escrito em disco,
      regenerado sob demanda. **Zero** rota, zero processo executável, zero `POST`. O rodapé declara
      isso.
- [x] AC-5: **Dado real, não fixture** — o painel e as queries leem a auditoria e as specs de
      verdade; nada hard-coded. Um repo sem runs mostra "sem atividade", não quebra.
- [x] AC-6: **Degrada sem workspace/db** — como todo o resto (ADR-0021): sem `universal.db`, os
      comandos avisam com a correção (`sync:universal`/`audit:sync`), não estouram.
- [x] AC-7: Entradas no registry (ADR-0020); os comandos passam pelo core e são auditados como os
      demais.
- [x] AC-8: Gates do próprio Forja: `release:check` (scripts no `files[]`), `tools:doctor`
      (docs-commands não acusa fantasma), `npm test` verde. Testes dos comandos novos.
- [x] AC-9: ADR-0028 registrando a decisão (auditoria consultável; painel estático-gerado como a
      resposta correta ao ADR-0022).

## 5. Escopo

**Dentro**:
- `audit:sync` (ingest jsonl → tabela) e `audit:query` (consulta).
- O comando gerador do painel HTML estático de governança.
- Schema da tabela de auditoria (no `memory-schema`/workspace db).
- ADR-0028 + testes.

**Fora** (explícito):
- **Servidor, rotas, execução pela web.** É exatamente o que o ADR-0022 congelou. Inegociável.
- **Instrumentar token por tarefa.** O painel tem lugar para isso, mas medir o custo de token de
  cada tarefa é outra frente (o audit hoje grava duração, não tokens). Follow-up.
- **Substituir o `project:dashboard`** (markdown, ecossistema de projetos). Este é sobre governança
  do framework; coexistem. Uma futura unificação é outra decisão.
- **Tempo real / auto-refresh.** O painel é gerado sob demanda; quem quer atualizar, regenera.

## 6. NFRs / restrições

- **Estático e self-contained (inegociável)**: o HTML abre com `file://`, sem rede, sem servidor. É o
  que separa esta spec da SPEC-002 congelada.
- **Fonte de verdade preservada**: o `.jsonl` continua sendo o log append-only; a tabela é uma
  projeção reconstruível (`audit:sync` do zero recria).
- **Token-aware**: o resumo da auditoria que o agente lê é menor que o `.jsonl` cru — a própria
  feature serve o ADR-0009.
- **Resiliência (ADR-0021)**: sem workspace/db, avisa e segue; nunca estoura.

## 7. Riscos e mitigação

| Risco | Prob | Impacto | Mitigação |
|---|---|---|---|
| Virar "dashboard servidor" de novo | B | **A** | AC-4 é gate: zero rota/processo. O painel é arquivo, não serviço |
| FTS5 vs SQL estruturado — over-engineering | M | B | O dado é estruturado (cmd/exit/duração); query por coluna. FTS só nos args, se valer |
| Painel gerado fica pesado/externo | M | M | Self-contained obrigatório (AC-3); mesmo princípio do prototipo já validado |
| Auditoria esparsa deixa o painel vazio | M | B | AC-5: "sem atividade" é estado válido, não erro. O dado cresce com o uso |

## 8. Métricas de sucesso

- "O `release:check` reprovou quantas vezes?" passa de contagem manual num `.jsonl` a **uma query**.
- O painel responde "o framework está saudável?" de relance, do dado real — e é um **arquivo**, não
  um serviço rodando (a lição do ADR-0022, aplicada).
- O resumo de auditoria que o agente lê é menor em tokens que o `.jsonl` cru — a governança visível
  também economiza contexto (ADR-0009).
- 90 dias: ninguém abre o `forja-runs.jsonl` na mão; a pergunta de governança vira comando ou painel.
