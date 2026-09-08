# Spec: cli-intuitiva-v1 — CLI descobrível pela própria CLI

- **ID**: SPEC-043
- **Status**: done
- **Owner**: apk
- **Criado em**: 2026-09-07
- **Sprint alvo**: <a definir>
- **ADRs relacionadas**: nenhuma — mudança aditiva ao registry declarativo (ADR-0020); nenhum
  comando existente muda de assinatura, saída default ou exit code.
- **Origem**: `docs/roadmap-v4.1.md`, Onda 1 (W1 + W2 + W3).

## 1. Problema

Agentes LLM e humanos erram ao operar o Forja porque a CLI não se explica:

- `forja help` despeja ~75 comandos numa parede única, com sufixos `(SPEC-0XX)` nas descrições
  (ruído para quem opera, sinal só para auditoria) e sem uma camada "os comandos do núcleo".
- **Não existe `forja help <comando>`**. O uso, os argumentos posicionais, exemplos e próximos
  passos não são descobríveis sem **executar o comando errado e interpretar o stack trace** do
  script-filho.
- `suggest()` só casa prefixo do segmento antes de `:` (`bin/forja.ts`): `forja plan` **não**
  sugere `spec:plan`. Mensagem de comando desconhecido não aponta para `help`.
- `tools:doctor` diagnostica mas não corrige. Em clone novo, os 3 avisos misturam "rotina de
  primeiro uso" (`workspace:init`, `sync:universal`) com problema real, sem rótulo.

**Como medimos hoje**: não há instrumentação de erros de CLI. Evidência qualitativa: as seções
"Corrigido" dos changelogs v3/v4 e a leitura de `bin/forja.ts` + `lib/core/registry.ts`.

## 2. Proposta de valor

Operar o Forja fica descobrível pela própria CLI: todo comando do núcleo tem `forja help <cmd>`
com uso, exemplo e próximo passo; erros de digitação sugerem o comando certo; `tools:doctor
--fix` resolve o setup de primeiro uso. Meta observável: um agente sem contexto prévio completa
`spec:new → spec:check` usando só `forja help`, sem doc externa.

## 3. User stories

- **Como** agente LLM operando o Forja pela primeira vez, **quero** `forja help <cmd>` com uso e
  exemplo, **para que** eu não execute o comando errado só para ler o stack trace.
- **Como** dev, **quero** `forja help` mostrando só o núcleo (~12 comandos), **para que** eu ache
  o que preciso sem rolar 75 linhas.
- **Como** agente, **quero** que `forja plan` (ou um typo) sugira `spec:plan`, **para que** eu me
  recupere sem consultar documentação externa.
- **Como** dev num clone novo, **quero** `forja tools:doctor --fix`, **para que** eu não
  copie/cole dois comandos de setup a cada clone.

## 4. Critérios de aceite (Definition of Done)

- [ ] **AC-1**: `lib/core/registry.ts` aceita campos **opcionais** por comando: `usage: string`,
      `args: {name, required, desc}[]`, `examples: string[]`, `next: string[]`,
      `readonly: boolean`, `json: boolean`, `tier: 'core' | 'advanced'`. Comandos sem esses
      campos continuam funcionando (teste de retrocompatibilidade).
- [ ] **AC-2**: `forja help <comando>` imprime nome, domínio, descrição, `usage`, tabela de
      `args`, `examples`, "Próximos passos" (`next`) e a ADR/SPEC de origem quando houver.
      Comando inexistente → sugestão do AC-4 e exit 1.
- [ ] **AC-3**: `forja help` (sem args) lista **apenas** comandos `tier: 'core'`, agrupados por
      domínio, **sem** o sufixo `(SPEC-0XX)` na linha, com rodapé
      `use 'forja help --all' para os N comandos restantes`. `forja help --all` mantém a saída
      completa atual.
- [ ] **AC-4**: `suggest()` casa por substring **e** distância de edição (≤ 2) sobre o nome
      completo; `forja plan` inclui `spec:plan` nas sugestões; toda mensagem de comando
      desconhecido termina com `forja help <melhor-palpite>`.
- [ ] **AC-5**: quando um comando declara `args` com `required: true` e o argumento falta,
      `bin/forja.ts` valida **antes de spawnar** o script-filho, imprime o `usage` do comando e
      sai com exit 1 — sem stack trace do filho.
- [ ] **AC-6**: `forja tools:doctor --fix [--yes]` executa **apenas** correções idempotentes e
      seguras de uma allowlist fixa (`workspace:init`, `sync:universal`); sem `--yes` pede
      confirmação; em stdin não-TTY sem `--yes`, aborta sem alterar nada. Sem `--fix`, o
      comportamento atual é inalterado.
- [ ] **AC-7**: a saída de `tools:doctor` é agrupada em três blocos rotulados fixos —
      **"Bloqueia o fluxo"**, **"Rotina de primeiro uso"**, **"Opcional (ferramentas)"**. O
      gerador do bloco `<framework-status>` do SessionStart usa a mesma classificação.
- [ ] **AC-8**: `test/forja-core.test.js` estendido: (a) todo comando `tier: 'core'` tem `usage`
      não-vazio e ≥ 1 `example`; (b) todo `example` começa com `forja ` e cita um comando que
      existe no registry; (c) `suggest('plan')` inclui `spec:plan`.
- [ ] **AC-9**: `node --test test/*.test.js`, `tsc --noEmit` e `node bin/forja.ts spec:check`
      continuam verdes.

## 5. Escopo

**Dentro**:
- Campos novos no registry, preenchidos para o conjunto `tier: 'core'` (proposta inicial, a
  fechar no `plan`): `workspace:init`, `project:new`, `spec:new`, `spec:plan`, `spec:tasks`,
  `spec:check`, `orchestrate`, `orchestrate:status`, `orchestrate:advance`, `context:smart`,
  `query:universal`, `tools:doctor`, `project:check`, `engineer`.
- `forja help <cmd>`, `forja help --all`, help curto por default.
- `suggest()` fuzzy; pré-validação de argumentos `required` em `bin/forja.ts`.
- `tools:doctor --fix` + reclassificação da saída em três blocos + alinhamento do SessionStart.
- Testes (AC-8) e ajuste da doc de comandos afetada.

**Fora** (evita scope creep):
- Preencher `usage`/`examples` dos ~75 comandos — só o núcleo agora; o resto é backlog incremental.
- `forja status` / `forja next` — Onda 2 (W4), spec própria.
- Contrato `--json` + exit codes global — Onda 2 (W5), spec própria.
- TUI / onboarding interativo.
- Corrigir a alocação de ID do `spec:new` (ver §Evidências) — task/bug separado.
- Qualquer mudança na semântica ou na saída default de comando existente.

## 6. NFRs / restrições

- **Compatibilidade**: nenhum comando existente muda de assinatura, saída default ou exit code.
  Exceção aditiva: `tools:doctor` ganha os blocos rotulados e a flag `--fix`. Checkout `.ts` e
  pacote publicado (`dist/*.js`) idênticos — `resolveScript` já cobre.
- **Performance**: `forja help` e `forja help <cmd>` são leitura do registry em memória, < 50 ms.
- **Segurança**: `tools:doctor --fix` nunca executa nada fora da allowlist fixa de dois comandos
  idempotentes; sem `--yes` exige confirmação; sem TTY e sem `--yes`, aborta.
- **Observabilidade**: cada execução de `--fix` é auditada em `forja-runs.jsonl` como hoje.

## 7. Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Definir "núcleo" errado (comando importante fora, ou núcleo inchado) | M | M | Lista revisada no `plan`; `forja help --all` sempre disponível; ajuste é 1 linha no registry |
| `suggest()` fuzzy devolve sugestão ruim e confunde o agente | B | B | Distância ≤ 2 e no máximo 5 sugestões; teste com casos reais de typo |
| `--fix` dispara `sync:universal` pesado sem o usuário querer | B | M | Confirmação obrigatória sem `--yes`; escopo restrito a 2 comandos idempotentes |
| `usage`/`example` no registry divergem do que o comando aceita | M | M | AC-8(b) valida que todo `example` cita comando existente; W6 (MCP) passará a reusar os mesmos campos, aumentando a pressão de manter em dia |

## 8. Métricas de sucesso

Avaliar 30 dias após o release, com **baseline coletado antes** sobre `forja-runs.jsonl`:

- Queda na taxa de "errei e corrigi": execução com exit ≠ 0 seguida, em < 2 min, de re-execução
  bem-sucedida do mesmo comando-base (proxy).
- Adoção: `help <cmd>` aparece em `forja-runs.jsonl` como comando efetivamente usado por agentes.
- Zero regressões abertas atribuídas a esta mudança.
- Qualitativo: numa sessão de agente sem contexto prévio, o agente completa `spec:new →
  spec:check` usando só `forja help`, sem doc externa.

## Evidências e estado real

**Implementado em 2026-09-07** (branch de trabalho, não commitado). Bateria: `tsc --noEmit`,
`node --test test/*.test.js` (479/479, +6 testes novos em `test/forja-core.test.js`),
`forja spec:check cli-intuitiva-v1`, `forja project:check` (100%), `forja tools:doctor` (exit 0,
3 blocos rotulados) — todos verdes.

| AC | Onde | Verificado |
|---|---|---|
| AC-1 | `lib/core/registry.ts` — `interface CommandSpec` + `CommandArg`, todos os campos `?` | `tsc` verde; comandos sem campos novos seguem resolvendo |
| AC-2 | `bin/forja.ts` `printCommandHelp()` + branch `help <cmd>` / `<cmd> --help` | `forja help spec:new` mostra uso+exemplo+próximos passos; `forja help xpto` → exit 1 |
| AC-3 | `bin/forja.ts` `printHelp(all?)` + `tier` em ~20 comandos | `forja help` só núcleo + rodapé `--all`; `diff` de `forja help --all` vs baseline = só `setup` novo + `(SPEC-` removido de 4 descs |
| AC-4 | `bin/forja.ts` `suggest()` + `levenshtein()` | `suggest('plan') ∋ spec:plan`; `forja plan` → stderr com `forja help spec:plan`; teste em `forja-core.test.js` |
| AC-5 | `bin/forja.ts` `missingRequiredArg()` antes do `spawnSync` | `forja spec:new` (sem slug) → `Uso:`, exit 1, sem stack; teste dedicado |
| AC-6 | `scripts/forja-setup.ts` + entrada `setup` no registry + `package.json` | `forja setup --yes` em WS temporário limpo cria estrutura + índice (exit 0); 2ª execução exit 0; sem TTY e sem `--yes` → exit 1, nada criado |
| AC-7 | `lib/core/health.ts` `bucketFor()`/`BUCKET_LABEL`; render em `scripts/tools-doctor.ts` e `scripts/hook-session-start.ts` | `forja tools:doctor` imprime os 3 rótulos; `runChecks`/exit-code intactos |
| AC-8 | `test/forja-core.test.js` — testes (a)(b)(c) | `node --test test/forja-core.test.js` verde (11 testes) |
| AC-9 | — | bateria acima verde |

- **Hipótese**, não medição: os ganhos de §8 dependem de instrumentação que ainda não existe;
  o baseline precede qualquer percentual prometido.
- **Mudanças de contrato vs. o texto original desta spec** (decididas no `plan.md`):
  1. **AC-6**: `tools:doctor --fix` → **`forja setup`** (comando dedicado). O cabeçalho de
     `scripts/tools-doctor.ts` declara que o doctor *não conserta* por desenho; um `--fix` ergueria
     a exceção que ele existe para impedir. O bloco "Rotina de primeiro uso" do doctor aponta para
     `forja setup`.
  2. **AC-1/AC-5**: o campo de args posicionais no registry chama-se **`cliArgs`**, não `args`
     (`args` já é o prefixo fixo repassado ao script no spawn).
  3. Núcleo ficou com ~20 comandos (não os 14 exatos do §5): `sync:universal` entrou por ser
     alvo de `setup` e de `workspace:init.next`. `tier` é 1 linha por comando, ajustável sem migração.
- **Bug lateral, ainda aberto** (achado A9 do roadmap): `spec:new` alocou `SPEC-040` (colisão);
  corrigido à mão para **SPEC-043**. Fora do escopo desta spec — candidato a bug fix próprio.
- **Pendências**: handoff `implement`/`review` não registrado via Hermes (o `hermes:handoff` exige
  payload JSON ADR-0005 completo + tabela `handoffs` no workspace); revisão de Governança sobre o
  diff ainda não feita; nada commitado.
