# ADR-0023: Doctor como gate do núcleo, não relatório de ferramentas

- **Status**: accepted
- **Data**: 2026-07-13
- **Autor(es)**: Allan Pablo
- **Tags**: harness, governance, memory, hooks, diagnostics

## Contexto

O ADR-0021 nomeou uma classe de falha do framework: erros que **erram sem avisar** — nenhum teste
quebra, nada aparece no `git status`, e o resultado é trabalho errado com aparência de trabalho
certo. Quatro casos foram corrigidos individualmente.

Em 2026-07-13 apareceu o quinto, e ele revelou por que corrigir caso a caso não fecha a classe.

Com o `better-sqlite3` compilado contra o ABI do Node 24 num runtime Node 26, a memória universal
morreu inteira: `query:universal`, `sync:universal`, `context:smart`, `agent:route`,
`memory:compress` e `project:dashboard`, todos inoperantes. A aposta nº 1 da visão — *"memória que
sobrevive"* — simplesmente não existia. As três superfícies de diagnóstico reagiram assim:

| Superfície | O que fez |
|---|---|
| `tools:doctor` | Reportou `2/5 ferramentas disponíveis` e saiu com **exit 0** |
| `SessionStart` | Detectou, mas prescreveu `npm install` — que **não** recompila binário nativo |
| `npm test` | Stack trace cru de `ERR_DLOPEN_FAILED` |

A correção real era `npm rebuild better-sqlite3`.

Dois problemas estruturais, não um bug:

1. **O doctor auditava o que não importa.** Ele checava cinco ferramentas *opcionais*, sobre as
   quais ele mesmo declarava: *"o fluxo nunca trava por elas"*. Era cego para tudo que trava. Um
   raio-x que só olha o que não pode quebrar.
2. **Cada superfície tinha heurística própria.** O hook resolvia a saúde da memória com um
   `catch { return null }` que colapsava *sem `node_modules`*, *ABI incompatível* e *banco ausente*
   no mesmo `null` — e então prescrevia a correção de apenas uma das três. Um operador seguindo a
   instrução do próprio framework não consertaria nada, e concluiria que o problema era outro.
   Uma prescrição errada é pior que silêncio: consome o tempo do operador e ainda desvia a
   investigação.

## Decisão

**O doctor passa a ser o gate do núcleo. As três superfícies passam a ler a mesma fonte.**

- **`lib/core/health.mjs`** — os checks viram **dados** (`CHECKS[]`), com um runner que os executa
  e devolve resultados estruturados. `tools:doctor`, `SessionStart` e (futuramente) o
  `release-auditor` são apenas apresentação. Nenhuma superfície volta a ter heurística local.
- **Probes classificam a causa; o runner nunca colapsa em booleano.** `ERR_DLOPEN_FAILED` →
  `npm rebuild better-sqlite3`. `ERR_MODULE_NOT_FOUND` → `npm install`. Banco ausente →
  `npm run sync:universal`. Causas distintas, correções distintas.
- **Cascata via `dependsOn`.** Um check cuja dependência falhou é `skipped`, não `fail`. Com o ABI
  quebrado, os checks de memória não têm o que observar; reportá-los como falha multiplicaria uma
  causa em três linhas vermelhas e esconderia a raiz. **Uma causa, uma linha vermelha.**
- **Dois contratos de exit code.** Núcleo crítico quebrado → `exit 1`. Ferramenta opcional ausente
  → `exit 0`, preservando o ADR-0018 à risca. Só `critical` trava: `workspace` ausente e Node fora
  do `engines` são avisos, porque não impedem trabalho.
- **Ausente ≠ quebrado.** Num clone novo — ou num CI — a memória simplesmente nunca foi indexada.
  Isso é o ponto de partida de qualquer instalação, não uma falha, e um comando resolve. `memory-db`
  distingue *não indexado* (aviso) de *existe mas não abre* (crítico). A primeira versão tratava os
  dois como crítico e o CI reprovou de imediato: um gate que reprova todo mundo no primeiro dia é um
  gate em que ninguém confia.
- **`scope: repo | runtime`.** `runtime-deps` e `mcp-json` — que convertem em gate executável dois
  invariantes que o ADR-0021 corrigiu à mão — só rodam dentro do repo do framework. Numa instalação
  `npm i -g forjajs` não há `devDependencies` nem `.mcp.json`, e rodá-los produziria falso positivo
  crítico na máquina do usuário final.
- **`spec:new` mantém a allow-list do `.gitignore`.** Descoberto durante a implementação: `/specs/*`
  é ignorado e as specs do framework entram por lista manual, então **toda spec nova nascia
  invisível ao git** — inclusive a desta ADR. Aplicando o princípio do próprio ADR-0021 ("mover a
  aplicação das regras do texto para o harness"), o comando passa a manter a lista.

## Alternativas consideradas

- **Melhorar só a mensagem do hook** — rejeitada: produziria uma prescrição *genérica*, e o
  problema foi exatamente uma prescrição genérica aplicada a um caso específico. A causa era o
  `catch` que apagava a informação, não o texto.
- **Doctor com `--fix` que roda `npm rebuild` sozinho** — rejeitada: executar comandos de build sem
  consentimento é a classe de risco oposta à que este ADR fecha. O doctor diagnostica e prescreve.
- **Fazer o índice defasado reprovar (`critical`)** — rejeitada: um gate que trava por aquilo que
  não impede trabalho é um gate que se aprende a ignorar, e aí ele para de proteger do que importa.
- **Check `spec-allowlist` avisando que a spec está fora do `.gitignore`** — rejeitada em favor de
  o `spec:new` manter a lista: trocaria uma falha silenciosa por um lembrete recorrente. Eliminar a
  classe de erro é melhor que reportá-la.
- **Um novo comando (`core:doctor`) separado** — rejeitada: dois doctores é como se chega a duas
  verdades divergentes sobre o mesmo sistema, que é precisamente o defeito que este ADR corrige.

## Consequências

**Positivas**:
- A quebra do núcleo aparece no **primeiro** comando executado, com a correção certa ao lado — não
  num sintoma indireto trinta minutos depois.
- Os invariantes do ADR-0021 ganham cobertura executável. Regressão em `.mcp.json` ou nas deps de
  runtime passa a reprovar o gate, em vez de reaparecer em produção.
- Uma só definição de "saudável". O hook e o doctor não podem mais divergir, porque leem a mesma
  lista.
- Check novo = entrada nova em `CHECKS[]`, e as três superfícies o ganham de graça.

**Negativas / Trade-offs**:
- `tools:doctor` pode agora **reprovar** (exit 1). Um ambiente já quebrado passa a falhar
  explicitamente onde antes passava calado — é o objetivo, mas muda o contrato de quem o usasse em
  script.
- `runtime-deps` usa parser estático conservador: import dinâmico não conta. Trocamos cobertura por
  ausência de falso positivo, deliberadamente — um crítico que mente é pior que um warning honesto.
- O `SessionStart` ganhou uma dependência a mais no caminho quente. Mitigado por rodar só
  `scope: 'runtime'` e nunca lançar: se a própria lib de health não carregar, o hook segue com o
  resto do briefing.

## Rastreamento

- Implementação: `lib/core/health.mjs`, `scripts/tools-doctor.mjs`, `scripts/hook-session-start.mjs`,
  `scripts/spec-cli.mjs`, `test/health.test.js`
- Spec: `specs/doctor-do-nucleo/` (SPEC-009)
- ADRs relacionadas: ADR-0018 (ferramentas de processo — estendido), ADR-0021 (guardrails de
  harness — a classe de falha que este fecha), ADR-0020 (core/registry), ADR-0009 (economia de
  tokens: `query:universal` é o primeiro passo, e índice defasado o corrompe em silêncio)
