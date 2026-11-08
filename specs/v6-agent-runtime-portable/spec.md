# Spec: v6-agent-runtime-portable

- **ID**: SPEC-059
- **Status**: draft
- **Owner**: allanpablo
- **Criado em**: 2026-11-08
- **Sprint alvo**: v6.0 Wave 2
- **ADRs relacionadas**: a criar em memory/90-decisions/

## 1. Problema
O forja fala com agentes de IA por subprocesso, e essa fronteira foi escrita para unix. Estado validado em 2026-11-08 (`packages/llm/src/index.ts`, `scripts/llm-fit.ts`, `lib/agent-evals.ts`, log da rodada 4 da célula `windows-latest` no PR #83, v5.2.0):

- **`llm:run` não spawnar o provedor** — `runLlm()` faz `spawn(executable, args, { shell: false, detached: true })` (`packages/llm/src/index.ts:123`). No Windows o que `npm i -g` instala é `claude.cmd`/`codex.cmd`, e o Node recusa spawnar `.bat`/`.cmd` sem `shell: true` desde o endurecimento da CVE-2024-27980 (18.20.2 / 20.12.2 / 21.7.3), com `EINVAL`. Toda execução termina em `errorCode: 'SPAWN_FAILED'`, exit 127, antes de falar com o provedor. **Não existe versão de Node suportada em que isso funcione**: a matriz do CI roda 22 e 24, ambas do lado endurecido.
- **`llm:doctor`/`llm:probe` mentem sobre o que está instalado** — as seis sondagens de binário usam `shell: false` explícito (`scripts/llm-fit.ts:76,84,86,91,104,108`). O mesmo `EINVAL` vira `available: false`, e o comando reporta "provedor indisponível" para uma CLI instalada e funcionando, saindo com código 1 se o perfil estiver habilitado. O `detail` traz o errno cru, não o diagnóstico.
- **`eval:agents` tem duas frentes unix** — `timed()`/`cliVersion()` spawnam o binário direto (`lib/agent-evals.ts:177,183`, mesma restrição do probe), e o check `type: 'command'` roda via `spawnSync('sh', ['-c', …])` (`lib/agent-evals.ts:254`). Sem `sh`, checks declarativos como `"run": "node --test"` (`templates/evals/agents/teste-do-criterio.json:21`) são inaplicáveis — ainda que o comando em si seja perfeitamente portável.
- **Timeout não derruba a árvore** — `killGroup()` mata com `process.kill(-pid, 'SIGTERM')` (`packages/llm/src/index.ts:132-140`). Grupo de processo por pid negativo é POSIX; no Windows lança e cai no `child.kill(signal)`, que (a) não alcança os netos — o CLI real que o shim `.cmd` spawnou sobrevive — e (b) não tem o grace de `SIGTERM_GRACE_MS`, porque sinal em Windows é emulação: `kill('SIGTERM')` termina incondicionalmente. O orçamento de custo do forja pressupõe que um agente estourando o timeout para de queimar token.

Quem sente: usuário Windows (`llm:run`/`llm:doctor`/`eval:agents` não funcionam, e um agente em timeout continua rodando e cobrando), agente de IA consumindo o doctor (relatório falso de disponibilidade), maintainer (esta família é 6 dos 10 casos que seguram o `continue-on-error` da célula Windows, SPEC-056 AC-4).

**Honestidade sobre os 6 casos do CI**: eles falham porque os testes modelam o CLI do agente como script com shebang + `chmod 0o755` (`test/agent-evals.test.js` AC-4/AC-5/AC-6, `test/llm-resume-validation.test.js:142` → `spawn EFTYPE`, `test/llm-claude-adapter.test.js:99`, `test/llm-integration.test.js:111`). O fixture é unix-cêntrico, mas o que ele expõe é o caminho real do produto: em Windows um binário de agente **é** um `.cmd`, e o produto não resolve `.cmd`. Consertar só o fixture — um stub em Node, por exemplo — deixaria a suíte verde com `llm:run` quebrado em produção. Por isso o AC-3 obriga o stub falso a passar pelo `.cmd`, em vez de desviar dele.

## 2. Proposta de valor
Um único módulo de execução de subprocesso (`lib/exec.ts`) que resolve o binário do agente (`where`/`PATHEXT`), escapa argumentos para `cmd.exe` quando o SO exige, derruba a árvore do processo no timeout e oferece um launcher de shell portável para checks declarativos. `llm:run`, `llm:doctor`, `llm:probe` e `eval:agents` passam a funcionar nos três SOs, e o primeiro item do inventário da SPEC-056 AC-4 — o único que quebra o produto do usuário em produção, e não o CI — zera.

Sem dependência nova, de propósito: o que falta são ~40 linhas de quoting que conseguimos testar exaustivamente, inclusive contra injeção. Importar `cross-spawn` para isso colocaria na cadeia de suprimento de uma CLI publicada um pacote que já teve o seu próprio CVE (ReDoS, CVE-2024-21538) — é o mesmo defeito que a SPEC-058 ataca, importar uma segunda máquina para o que a primeira já faz. A decisão fica registrada em ADR, com a alternativa documentada em vez de esquecida (R-1).

## 3. User stories
- **Como** usuário Windows, **quero** que `forja llm:run` encontre o `claude`/`codex` que o npm instalou, **para que** eu use o framework sem depender de WSL.
- **Como** operador, **quero** que o `llm:doctor` distinga "não instalado" de "instalado mas o forja não conseguiu executar", **para que** o relatório não me mande reinstalar o que já está lá.
- **Como** maintainer rodando `eval:agents` com orçamento, **quero** que o timeout derrube a árvore inteira do agente, **para que** um caso estourado não continue queimando token depois do resultado sair.
- **Como** contribuidor, **quero** escrever checks `type: 'command'` com comandos portáveis e vê-los rodar em qualquer SO, **para que** a suíte de evals não seja um ativo só de unix.

## 4. Critérios de aceite (Definition of Done)
- [ ] AC-1: os quatro call sites de fronteira de agente passam por `lib/exec.ts` (`resolveCommand`, `spawnAgent`, `runShell`, `killTree`): `packages/llm/src/index.ts:123`, `scripts/llm-fit.ts:76,84,86,91,104,108`, `lib/agent-evals.ts:177,183` e `lib/agent-evals.ts:254`. Spawn de `git`, `node` e `process.execPath` continua como está — não é a fronteira em questão e mexer nele seria escopo emprestado.
- [ ] AC-2 (segurança): o quoting de argumentos para `cmd.exe` é provado por teste com argumentos hostis — `"`, `&`, `|`, `>`, `<`, `%VAR%`, `^`, espaço, caminho com `\` — chegando ao processo-filho byte a byte como foi passado, e nenhum deles executando um segundo comando. O prompt do usuário e o comando do perfil são argumentos: sem este AC, o AC-1 trocava `EINVAL` por injeção. `shell: true` do Node nunca é usado (ele não escapa argumentos).
- [ ] AC-3 (fixture não desvia do produto): o stub de agente dos testes é um `.cmd` no Windows e continua script com shebang em unix, executado pelo mesmo resolver do produto. Os 6 casos do inventário ficam verdes na célula Windows **sem skip**.
- [ ] AC-4 (a árvore morre junto): em timeout, `runLlm` derruba filho e netos nos três SOs — no Windows por `taskkill /pid <pid> /T /F` ou equivalente, em POSIX pelo pid negativo como hoje. Teste: agente falso de dois níveis cujo neto escreve a cada 100ms para de escrever depois do grace, nos dois SOs. `exitCode: 124` / `errorCode: 'TIMEOUT'` não mudam.
- [ ] AC-5 (diagnóstico honesto): binário não encontrável → `available: false` com `detail` dizendo o que foi procurado (caminho resolvido, `PATHEXT`); binário encontrável que falha ao executar → outro detail. O contrato `--json` (ADR-0082) e os campos existentes não mudam, só o conteúdo de `detail`.
- [ ] AC-6 (checks `command`): `type: 'command'` roda por `runShell`, que usa `sh -c` em POSIX e `%ComSpec% /d /s /c` no Windows; as suítes de `templates/evals/agents/*.json` rodam inteiras nos três SOs. `CheckResult` não ganha estado novo nesta spec.

## 5. Escopo
**Dentro**:
- `lib/exec.ts` (novo) + `test/exec.test.js` (novo): resolver, quoting, `killTree`, `runShell`.
- `packages/llm/src/index.ts`: `runLlm` aceita launcher injetável — o pacote hoje importa só `node:child_process` e continua assim; quem injeta é o `scripts/llm-fit.ts`.
- `scripts/llm-fit.ts`: as seis sondagens do doctor e a chamada de `runLlm`.
- `lib/agent-evals.ts`: `timed()`, `cliVersion()` e o check `command`.
- Fixtures dos quatro arquivos de teste do inventário: stub portável.

**Fora**:
- `cross-spawn`/`execa`/qualquer dependência nova (§2, R-1).
- Estado `skipped` em `CheckResult` — muda o JSON que o dashboard de evals consome; decisão separada.
- Os outros dois itens do inventário Windows (`git worktree` em `test/simulate-cli.test.js`, `spec:trace 0/0` na jornada) e a linha `continue-on-error` do `ci.yml`, que só sai quando o inventário inteiro zerar.
- WSL como caminho suportado: é contorno, não solução, e o framework já é usado fora dele.
- Reescrever checks `command` de usuários em Node: o launcher portável resolve sem exigir migração.

## 6. NFRs / restrições
- Segurança: fronteira de subprocesso com argumento vindo de usuário (prompt) e de configuração (comando do perfil). Quoting é requisito, não otimização.
- Compatibilidade: em POSIX/macOS nenhum comportamento muda — o caminho direto continua vencendo quando existe, como no `inside()` da SPEC-056. Zero regressão nos 666 testes das células ubuntu/macos.
- Superfície: um módulo, quatro funções. `hasBinary()` (`lib/project-wiring.ts:98`) já resolve binário por plataforma com `where`/`which` — o módulo segue essa convenção em vez de inventar outra, e ela passa a ser caso particular de `resolveCommand`.
- Custo: zero minuto novo de CI (os testes rodam na matriz que já existe).

## 7. Riscos e mitigação
| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Quoting de `cmd.exe` escrito à mão deixar passar injeção | M | A | AC-2 com casos hostis explícitos; ADR registra o que foi testado; alternativa (dependência) documentada em vez de esquecida |
| `taskkill /T` não alcançar neto de shim `.cmd` encadeado | M | M | AC-4 mede com agente falso de dois níveis; se não alcançar, o detail do timeout reporta quantos processos restaram |
| Consertar o fixture e não o produto (suíte verde, `llm:run` quebrado) | M | A | AC-3 obriga o stub a ser `.cmd` no Windows e a passar pelo resolver do produto |
| Launcher injetável em `runLlm` quebrar o contrato dos adapters | B | M | Injeção com default = comportamento atual; testes existentes de resume/timeout continuam provando o mesmo contrato |
| `resolveCommand` escolher binário errado (PATH com duplicados) | B | M | `where` lista todos; o módulo usa o primeiro e o AC-5 expõe o caminho resolvido no `detail` |
| `runShell` executar comando de check com semântica diferente por SO | M | M | AC-6 roda as suítes template nos três SOs; comando que não é portável falha com o launcher no detail, não silenciosamente |

## 8. Métricas de sucesso
30 dias após: `llm:run`, `llm:doctor` e `eval:agents` verdes na célula Windows do CI; inventário da SPEC-056 AC-4 de 3 causas/10 casos para 2 causas/4 casos; zero relato de "provedor indisponível" em máquina com o provedor instalado; nenhum caso novo nos testes de injeção de argumento.

## Evidências e estado real
Levantamento de 2026-11-08, branch `feat/v6-wave1` (PR #83), por leitura de código e log da rodada 4 — sem patch adivinhado:

- **Call sites lidos, um a um**: `packages/llm/src/index.ts:123` (`spawn` com `shell: false, detached: true`), `:132-140` (`killGroup` com `process.kill(-pid)` e fallback `child.kill`), `scripts/llm-fit.ts:76,84,86,91,104,108` (seis sondagens com `shell: false`), `lib/agent-evals.ts:177,183` (spawn direto do binário do agente), `:254` (`spawnSync('sh', ['-c', check.run])`).
- **Os 6 casos da célula Windows**: `test/llm-resume-validation.test.js:142` (`spawn EFTYPE`), `test/agent-evals.test.js` AC-4/AC-5/AC-6 (`agent.args` nunca escrito), `test/llm-claude-adapter.test.js:99`, `test/llm-integration.test.js:111`. Os 2 casos do AC-1 da SPEC-054, que eram desta família, ficaram verdes na rodada 2 — o que confirma que a causa deles era o CRLF das skills, não o stub, e é o motivo de esta spec não reivindicá-los.
- **Restrição do Node**: spawn de `.bat`/`.cmd` sem `shell: true` lança `EINVAL` desde 18.20.2 / 20.12.2 / 21.7.3 (endurecimento da CVE-2024-27980). A matriz do CI roda Node 22 e 24: as duas células estão do lado endurecido, então não há versão suportada em que o código atual funcione no Windows.
- **Comando do check template é portável, o launcher não**: `"run": "node --test"` em `templates/evals/agents/teste-do-criterio.json:21` roda igual em `cmd.exe`; o que impede é o `sh` fixo na linha 254.
- **Convenção que já existe no repo**: `lib/project-wiring.ts:98` usa `where` no Windows e `which` no resto. Também por isso o caminho é um módulo só — não quatro remendos de plataforma espalhados pelos call sites.
- **Estado**: spec em draft, nenhuma linha de produto escrita. A implementação depende de aprovação e roda na mesma branch da Wave 2.
