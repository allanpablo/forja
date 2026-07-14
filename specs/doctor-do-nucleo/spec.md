# Spec: doctor-do-nucleo

- **ID**: SPEC-009
- **Status**: done
- **Owner**: apk
- **Criado em**: 2026-07-13
- **Sprint alvo**: S?
- **ADRs relacionadas**: [ADR-0018](../../memory/90-decisions/0018-ferramentas-de-processo.md) (tools:doctor), [ADR-0021](../../memory/90-decisions/0021-guardrails-de-harness.md) (guardrails de harness), [ADR-0019](../../memory/90-decisions/0019-workspace-separado.md) (workspace), [ADR-0009](../../memory/90-decisions/0009-claude-hooks-token-economy.md) (economia de tokens)

## 1. Problema

O `tools:doctor` audita cinco ferramentas **externas e opcionais** e conclui com a própria
ressalva: *"ferramentas ausentes apenas desativam seus gates — o fluxo nunca trava por elas."*
Ele diagnostica exatamente aquilo que não é crítico, e é cego para tudo que é.

Em 2026-07-13, com `better-sqlite3` compilado contra o ABI do Node 24 num runtime Node 26,
a memória universal — a aposta nº 1 da visão, *"memória que sobrevive"* — estava **morta**:
`query:universal`, `sync:universal`, `context:smart`, `agent:route`, `memory:compress` e
`project:dashboard` todos inoperantes. O framework reagiu assim:

| Superfície | O que fez | O que deveria ter feito |
|---|---|---|
| `tools:doctor` | Reportou `2/5 ferramentas disponíveis`, tudo aparentemente normal | Falhar apontando o ABI quebrado |
| `SessionStart` | Detectou, mas prescreveu `npm install` + `sync:universal` | Prescrever `npm rebuild better-sqlite3` |
| `npm test` | Stack trace de `ERR_DLOPEN_FAILED` | — (aceitável, mas sem orientação) |

A prescrição errada é o pior dos três. `npm install` **não** recompila binário nativo quando o
lock já bate; quem seguisse a instrução do próprio framework não consertaria nada e concluiria
que o problema era outro.

Esta é a **quinta ocorrência** da classe de falha que o ADR-0021 nomeia — *"erram sem avisar…
produzem trabalho errado com aparência de trabalho certo"*. As quatro anteriores receberam
correções pontuais. Falta o gate genérico: **nada valida o núcleo do framework**, e dois dos
quatro casos já corrigidos (`.mcp.json` com path absoluto; `better-sqlite3` fora de
`dependencies`) podem reincidir sem que nenhum teste ou gate perceba.

## 2. Proposta de valor

Uma única fonte de verdade sobre a saúde do núcleo, consumida por todas as superfícies de
diagnóstico: **toda quebra do núcleo é detectada na primeira vez que o operador toca o
framework, com o comando de correção correto ao lado.**

## 3. User stories

- **Como** operador, **quero** que `tools:doctor` falhe quando o núcleo está quebrado,
  **para que** eu não descubra por um stack trace de `dlopen` trinta minutos depois.
- **Como** operador que trocou de versão do Node, **quero** a prescrição certa
  (`npm rebuild better-sqlite3`), **para que** eu não perca tempo seguindo um conselho errado
  do próprio framework.
- **Como** agente iniciando sessão, **quero** saber que a memória está defasada ou morta antes
  de confiar num `query:universal`, **para que** eu não construa raciocínio sobre contexto vazio.
- **Como** governança, **quero** um gate que reprove um release em que os invariantes do
  ADR-0021 regrediram, **para que** as correções pontuais não se percam com o tempo.
- **Como** autor de uma spec do framework, **quero** que ela seja versionada por padrão,
  **para que** eu não a perca sem aviso — hoje o `.gitignore` a descarta calado.

## 4. Critérios de aceite (Definition of Done)

- [x] AC-1: Existe `lib/core/health.mjs` exportando os checks de núcleo como dados
      (`{ id, severity, probe, fix }`), sem I/O de apresentação.
- [x] AC-2: `tools:doctor` reporta **duas seções** — Núcleo e Ferramentas — e sai com código
      **≠ 0** se e somente se algum check `critical` do núcleo falhar. Ausência de ferramenta
      opcional continua sendo `exit 0` (contrato do ADR-0018 preservado).
- [x] AC-3: Check de **ABI nativa**: com `better-sqlite3` compilado para outro `NODE_MODULE_VERSION`,
      o doctor falha com a mensagem apontando `npm rebuild better-sqlite3`. Testável simulando
      o `ERR_DLOPEN_FAILED`.
- [x] AC-4: Check de **memória**: distingue os três estados — banco ausente, banco inacessível,
      banco defasado (`memory/` alterado depois do último sync) — cada um com sua correção.
- [x] AC-5: Check de **workspace**: `lib/workspace.mjs` resolve para diretório existente; se não,
      prescreve `npm run workspace:init`.
- [x] AC-6: Check de **deps de runtime** (regressão do ADR-0021 §2): todo módulo importado
      estaticamente por scripts sob `files[]` está em `dependencies`, não em `devDependencies`.
- [x] AC-7: Check de **`.mcp.json`** (regressão do ADR-0021 §1): nenhum path absoluto versionado.
- [x] AC-8: O hook `SessionStart` consome `lib/core/health.mjs` — **zero heurística própria** — e
      a prescrição errada atual (`npm install`) deixa de existir no código.
- [x] AC-9: Testes cobrindo cada check nos dois estados (são e quebrado), com a suíte verde.
- [x] AC-10: ADR registrando a decisão (doctor como gate do núcleo vs. relatório de ferramentas).
- [x] AC-11: `spec:new` **mantém a allow-list do `.gitignore` sozinho** ao criar uma spec do
      framework. Criar uma spec e rodar `git status` passa a mostrá-la, sem passo manual.
      *(Emenda de 2026-07-13 — ver §5.)*

## 5. Escopo

**Dentro**:
- `lib/core/health.mjs` — os checks como dados, reutilizáveis.
- `scripts/tools-doctor.mjs` — passa a consumir a lib; ganha seção de núcleo e exit code.
- `scripts/hook-session-start.mjs` (ou equivalente) — passa a consumir a lib.
- Os sete checks: ABI nativa, banco presente, banco fresco, workspace resolvido, deps de runtime,
  `.mcp.json` limpo, Node vs. `engines`.
- `scripts/spec-cli.mjs` — allow-list do `.gitignore` mantida pelo harness (AC-11).
- ADR + testes.

> **Emenda (2026-07-13).** Ao escrever o plano, descobrimos que o `.gitignore` ignora `/specs/*` e
> mantém uma allow-list manual: **toda spec nova do framework nasce invisível ao git**. O `spec:new`
> cria, o `spec:check` aprova, e o git descarta calado — aconteceu com esta própria spec. É a mesma
> classe de falha do ADR-0021, dentro da ferramenta que estamos consertando.
>
> Rejeitamos resolver isso com um *check* no doctor (`spec-allowlist` → warn): trocaria uma falha
> silenciosa por um lembrete recorrente que se aprende a ignorar. Seguimos o próprio ADR-0021 —
> *"mover a aplicação das regras do texto para o harness"* — e fazemos o `spec:new` manter a lista.
> A classe de erro deixa de existir em vez de ser reportada.

**Fora** (explícito, evita scope creep):
- **Autocorreção.** O doctor diagnostica e prescreve; não executa `npm rebuild` sozinho.
  Rodar comandos de build sem consentimento é a classe de risco oposta.
- Novos gates de qualidade de código (lint, cobertura) — não é sobre isso.
- Alterar o conjunto das cinco ferramentas opcionais do ADR-0018.
- Reindexação automática da memória (`sync:universal` permanece explícito).

## 6. NFRs / restrições

- **Performance**: o doctor completo roda em < 2s. O `SessionStart` não pode ficar perceptivelmente
  mais lento — os checks caros (deps, `.mcp.json`) só entram no doctor, não no hook.
- **Resiliência**: todo acesso a SQLite permanece *lazy* (ADR-0021). O doctor precisa funcionar
  **sem `node_modules`** — é justamente aí que ele mais importa. Um check que estoura ao
  diagnosticar é pior que check nenhum.
- **Contrato**: `exit 0` continua significando "posso trabalhar". Ferramenta opcional ausente
  nunca trava; núcleo quebrado sempre trava.
- **Compatibilidade**: o comando `tools:doctor` mantém nome, entrada no registry (ADR-0020) e
  saída legível.

## 7. Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Doctor vira gate ruidoso e o operador aprende a ignorá-lo | M | A | Só `critical` trava. Warning (índice defasado) informa sem falhar |
| Check de deps de runtime dá falso positivo (import dinâmico, opcional) | M | M | Parser estático conservador: na dúvida, warning e não erro |
| Detecção de ABI depende de string de erro do Node | M | M | Casar por `err.code === 'ERR_DLOPEN_FAILED'`, não por mensagem |
| Doctor duplica o que o `release-auditor` já faz | B | B | Agente simula tarball (pré-publicação); doctor valida o repo vivo. `release-auditor` pode passar a consumir a mesma lib |
| Escopo escorrega para "doctor conserta tudo" | M | A | Autocorreção está explicitamente fora |

## 8. Métricas de sucesso

- **Zero** falhas silenciosas da classe ADR-0021 nos 30 dias após o release: toda quebra do núcleo
  aparece no primeiro comando executado, não num sintoma indireto.
- Tempo entre quebrar o ambiente (ex.: trocar a major do Node) e ter o diagnóstico correto em mãos:
  de *indefinido* (hoje o operador é ativamente mal orientado) para **um comando**.
- Os quatro invariantes já corrigidos pelo ADR-0021 passam a ter cobertura executável — regressão
  em qualquer um deles reprova o gate em vez de reaparecer em produção.
