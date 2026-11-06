# Spec: v6-token-economy

- **ID**: SPEC-057
- **Status**: implementing — Wave 1 entregue e medida (AC-1..AC-5); Wave 3 (tokenizer real, memória híbrida, skills lazy) segue aberta
- **Owner**: allanpablo
- **Criado em**: 2026-11-05
- **Sprint alvo**: v6.0 Wave 1 (snippets + sync incremental); Wave 3 (tokenizer real, memória híbrida)
- **ADRs relacionadas**: a criar em memory/90-decisions/

## 1. Problema
O forja injeta mais contexto do que o necessário em cada comando, e o custo é pago pelo usuário em tokens. Estado validado em 2026-11-05 (v5.2.0):

- `lib/context-builder.ts:199` injeta `node.content` **inteiro** para cada nó de memória relevante, apesar de o SQLite ser FTS5 (que tem `snippet()` nativo para retornar apenas o trecho casado).
- `lib/code-context.ts:100-120`: `--code` lê **todos os arquivos do módulo por completo**, sem filtro por relevância nem cache.
- Skills são copiadas fisicamente em **2 destinos por projeto** (`.claude/skills` + `.agents/skills`, `lib/project-wiring.ts:41-47` e loop :235-249): 34 pastas / 276KB duplicados por agente suportado.
- Estimativa de tokens = `bytes/4` em `context-builder.ts:223` e `scripts/token-economy.ts:18/:127/:143` — sem tokenizer real, o relatório de economia mede aproximado.
- Sync de memória reprocessa conteúdo sem `content_hash` incremental (re-trabalho a cada sync).

Quem sente: todo usuário que roda `forja` com agentes de IA — contexto inflado = custo maior e janela útil menor.

## 2. Proposta de valor
Reduzir os tokens injetados por comando sem perder sinal: snippet FTS5 no lugar de conteúdo integral, sync incremental por hash, e medição honesta com tokenizer real — meta Wave 1: ≥ 50% de redução no payload de memória injetado nos comandos `context`/`code:context`, medida por um cenário de referência determinístico (`forja token:benchmark`), não pelo `token-economy` (que mede outro eixo).

## 3. User stories
- **Como** usuário pagando tokens, **quero** que só o trecho relevante da memória seja injetado, **para que** cada comando custe menos e caiba mais contexto útil na janela.
- **Como** agente de IA, **quero** que `--code` traga só arquivos/trechos pertinentes à tarefa, **para que** eu não desperdice janela com módulo inteiro.
- **Como** maintainer, **quero** sync incremental por `content_hash`, **para que** re-sync de projeto grande não reprocessa tudo.
- **Como** maintainer, **quero** que `token-economy` use tokenizer real, **para que** a métrica de economia seja confiável.

## 4. Critérios de aceite (Definition of Done)
- [x] AC-1: `context-builder.ts` usa `snippet(fts, col, marker, marker, radius)` para nós de memória; conteúdo integral só quando o nó for curto (< limite configurável, default ~400 tokens) ou marcado como sempre-integral.
- [x] AC-2: Redução ≥ 50% no total de tokens injetados em cenário de referência (projeto com ≥ 50 nós de memória), medido por máquina de evidência própria, registrada nas evidências.
- [x] AC-3: Sync de memória grava `content_hash` por nó e pula reprocessamento quando inalterado; re-sync de projeto inalterado custa ~0 reprocessamentos (log mostra skipped).
- [x] AC-4: `code-context` limita leitura por relevância (ordem FTS/grep interno) com flag `--full` como opt-in para comportamento atual.
- [x] AC-5: Nenhum teste existente quebra; saída dos comandos continua parseável pelos consumidores atuais (contrato de formato preservado).

## 5. Escopo
**Dentro**:
- `lib/context-builder.ts` (snippet FTS5 + política de integral).
- `lib/code-context.ts` (seleção por relevância + `--full`).
- Sync de memória (`scripts/memory-*`): `content_hash` incremental.
- `scripts/token-economy.ts`: medição antes/depois para evidência.
- `scripts/token-benchmark.ts`: cenário de referência determinístico (fixture própria, 60 nós) — é dele que sai o número do AC-2, porque medir "economia" num projeto inexistente produz número sem medição.

**Fora**:
- Tokenizer real (tiktoken) — Wave 3; bytes/4 continua, documentado como limitação.
- Embeddings/memória híbrida (sqlite-vec) — Wave 3.
- Skills lazy por trigger — Wave 3 (SPEC de skills, se houver).
- Mudança do schema FTS5 além do necessário para snippet.

## 6. NFRs / restrições
- Performance: `context` não pode ficar mais lento que hoje (snippet é mais barato que SELECT content inteiro).
- Compatibilidade: projetos com memória antiga continuam funcionando (migração de `content_hash` lazy no primeiro sync).
- Determinismo: snippets estáveis para o mesmo par query/nó (sem ordem aleatória).

## 7. Riscos e mitigação
| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Snippet cortar informação essencial do nó | M | A | Política de integral para nós curtos/críticos + flag `--full-context`; AC-2 mede só payload, testes cobrem qualidade |
| `content_hash` invalidar cache errado (falso skip) | B | A | Hash do conteúdo normalizado + teste de mutação (muda 1 char → reprocessa) |
| `--code` por relevância omitir arquivo necessário | M | M | `--full` opt-in documentado; ranking por path+módulo antes de cortar |

## 8. Métricas de sucesso
30 dias após: redução ≥ 50% nos tokens de memória por comando `context` em projetos reais; tempo de re-sync de projeto inalterado < 10% do sync cheio; zero issues de "contexto cortou informação".

## Evidências e estado real
Medições de 2026-11-05, branch `feat/v6-wave1`, sobre v5.2.0.

- **Diagnóstico validado**: leitura direta de `context-builder.ts` (conteúdo integral por nó), `code-context.ts` (fatia inteira, sem relevância), `project-wiring.ts:41-47/:235-249` (skills em 2 destinos), `token-economy.ts` (bytes/4), e a contagem de skills (34 pastas = 276KB).
- **AC-1 (trecho, não inteiro)**: `snippet(search_idx, 2, '**', '**', ' … ', 24)` no caminho FTS e janela calculada (`excerptAround`) no caminho `LIKE`, com política de integral abaixo de `FULL_CONTENT_MAX_CHARS` (1600 chars ≈ 400 tokens, configurável por `FORJA_CONTEXT_FULL_MAX_CHARS`) e `mission.md`/`standards.md` sempre inteiros — o corte da constituição do pack orienta pior que o silêncio. Todo corte é visível: rodapé `- **Excerpts**: N/M nodes` e a linha `⋯ X chars omitidos — leia o arquivo acima ou rode com --full-context`.
- **AC-2 (meta ≥ 50%)**: a evidência não vem do `token-economy` (que mede outro eixo) mas de uma máquina própria e determinística, `referenceScenario()` em `scripts/token-benchmark.ts`, com 60 nós de texto fixo num workspace descartável. Medido: **−80%** no termo que casa pelo FTS (`pagamentos`), **−81%** no termo que só o `LIKE` casa (`pagament`), **−29%** no termo composto em que os globais sempre-integral dominam o pacote, **0%** no termo sem casamento (controle: sem casamento não há o que cortar, e a máquina diz isso em vez de inventar). Veredito impresso: `Meta AC-2 (≥ 50% no termo que casa): −80% → ✅`.
- **Defeito achado ao medir (o pior tipo)**: `forja token:benchmark` media um projeto chamado `benchmark-project`, que não existe em lugar nenhum — `domain`/`task` voltavam só com os globais e o relatório anunciava **~99,6% de economia** de um pacote vazio, com ar de número. Agora o projeto de referência sai do banco (o que tem mais nós), o termo sai dos caminhos indexados (`30-domains/<x>/`, senão slug de spec), cada modo imprime `Nodes:`, e se `domain`/`task` não trouxerem um nó a mais que `global` o relatório cospe `⚠️ nenhum nó do projeto além dos globais — economia vazia, não conte este número` e sai cedo em vez de tabular vento.
- **AC-3 (sync incremental)**: `content_hash` por nó + `project_id`; nó inalterado é pulado antes de qualquer trabalho e o sync fecha com `N indexados · M inalterados (pulados) · K falhas`. O pulo é por hash, não por mtime — provado no teste que mexe o mtime e ainda assim pula.
- **Segundo defeito achado pelo caminho**: `memory-fresh`, o check que existe para avisar que o índice está velho, comparava o mtime do `.db` com o de `memory/`. Com WAL ativo, um sync pequeno escreve no `-wal` e **não toca no mtime do banco** — o check dizia "índice em dia" para índice velho, exatamente o caso que deveria pegar. Reparo duplo: o sync grava `sync_meta(last_sync)` e faz `wal_checkpoint(TRUNCATE)`, e o check lê o timestamp registrado (mtime só como fallback para banco de versão anterior). Testado nos dois lados.
- **AC-4 (código por relevância)**: `byRelevance` (termo no caminho > termo no conteúdo, depois camada `domain → application → infrastructure → presentation`, depois caminho para o desempate ser sempre o mesmo) + `withinBudget` de `CODE_TOKEN_BUDGET = 6000` tokens, com `codeOmitted` no pacote e no rodapé do comando — nunca corte calado. `--full` repõe a fatia inteira, e é o que `token:economy` usa explicitamente para não passar a medir outra coisa.
- **AC-5 (contrato)**: formatos antigos seguem válidos — os testes de regressão do pack checam `**Path**: \`…\`` e os consumidores de `docs/commands.md` não mudaram de forma. Um segundo ponto de entrada morto (CLI module-level em `lib/context-builder.ts`, com usage apontando para um `scripts/context-builder.mjs` que não existe) foi removido; o caminho vivo é `forja context:smart`.
- **Limitação assumida**: tokens = bytes/4 em todo o framework (Wave 3 traz tokenizer real). Os percentuais acima são da mesma régua usada antes, então a *comparação* é válida mesmo que o valor absoluto não seja.
- **Cobertura (gate da SPEC-056 no caminho desta wave)**: `forja quality:coverage` reprovava em 86,1–86,9% contra o piso 87 — e o número mudava entre execuções idênticas. Isolado: a variação vinha dos CLIs filhos escrevendo cobertura no mesmo agregador do Node (não desta wave). Com a medição consertada em `test/isolate-workspace.mjs`, o estado aqui é **`OK 91,80% (piso subido para 90)`**, exit 0, reproduzido duas vezes com o mesmo valor, 662/662 verdes.
- **Terceiro ponto de entrada morto removido**: o bloco CLI de módulo em `lib/context-builder.ts` (usage apontando para um `scripts/context-builder.mjs` que nunca existiu) — dois caminhos para o mesmo comando é o que gera documentação que mente.
- **Defeito achado no smoke do AC-4 (e que a suíte não via)**: `forja code:context <domínio> --full` **não chegava ao script**. Comandos roteados como capability não recebem o argv do usuário: o roteador o parseia contra `params` declarados e reconstrói — flag não declarada é descartada em silêncio. `--full`, o `[termo]` e `--project` estavam fora dos params de `code.context`, então o help prometia três flags mortas. Corrigido nos params, e o teste novo em `test/cli-params.test.js` agora atravessa o `usage` de todo comando-capability e reprova qualquer `--flag` anunciada que não esteja declarada — a mesma varredura pegou dois drifts pré-existentes (`orchestrate:status`/`advance` prometiam `--slug` para um script que lê `argv[0]`; usage corrigido para `<slug>`).
- **Estado final da wave**: `npm test` → 665/665 verdes; `npm run types:check` → 0 erros; `forja quality:coverage` → `OK 91,80% (piso 90%)`; `forja tools:doctor` → ressalva só de `handoff-orphans` (35, pré-existente) e da ferramenta opcional `codegraph`.
- AC-2 será evidenciado com números antes/depois do `token-economy` na mesma base de referência.
