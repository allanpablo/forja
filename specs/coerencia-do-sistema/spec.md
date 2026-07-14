# Spec: coerencia-do-sistema

- **ID**: SPEC-011
- **Status**: review
- **Owner**: apk
- **Criado em**: 2026-07-14
- **Sprint alvo**: S?
- **ADRs relacionadas**: [ADR-0024](../../memory/90-decisions/0024-gate-do-tarball.md) (gate do tarball), [ADR-0023](../../memory/90-decisions/0023-doctor-como-gate-do-nucleo.md) (gate do núcleo), [ADR-0021](../../memory/90-decisions/0021-guardrails-de-harness.md) (guardrails), [ADR-0020](../../memory/90-decisions/0020-forja-core-cli-unica.md) (registry), [ADR-0009](../../memory/90-decisions/0009-claude-hooks-token-economy.md) (economia de tokens)

## 1. Problema

**Nenhum step do sistema pode ser obscuro.** O Forja é operado por agentes que leem a documentação
e executam o que ela manda. Quando a doc e o código divergem, o agente não erra por burrice — erra
por obediência.

Em 2026-07-14, uma auditoria manual encontrou:

| O que | Onde | Consequência |
|---|---|---|
| `context:build`, `memory:db:reindex`, `memory:db:stats`, `cache:clear` — **quatro comandos que não existem em lugar nenhum** | `docs/token-optimization.md` | É o documento que ensina a **economia de tokens** (ADR-0009), o mecanismo central do framework. Um agente obediente executa comandos fantasma |
| Link para `docs/DEPLOYMENT.md`, que nunca existiu | idem | — |
| `tools:doctor` descrito como *"saber quais gates opcionais estão disponíveis"* | `.claude/agents/governance.md`, `prompts/governance-agent.md` | É a definição de **antes** do ADR-0023. O papel que reprova merges não sabia que o gate reprova |
| `release:check` desconhecido pelo Governance | idem | Criamos o gate do tarball e não contamos a quem deveria usá-lo |
| 2 comandos do registry **nunca mencionados** em doc, prompt, agente ou ADR | `workspace:project:check`, `memory:extract` | Existem e ninguém sabe para quê. Capacidade obscura é capacidade morta |

Nada disso quebrou um teste. Nada apareceu no `git status`. É a classe que o ADR-0021 nomeia —
*erra sem avisar* — aplicada à **camada de instrução**: o sistema descreve a si mesmo de forma
incorreta, e quem age sobre essa descrição produz trabalho errado com aparência de trabalho certo.

Os ADRs 0023 e 0024 fecharam essa classe no núcleo e no tarball. Falta a fronteira onde ela é mais
barata de introduzir e mais cara de perceber: **a palavra escrita.** Toda vez que um comando é
renomeado, um gate muda de contrato ou uma capacidade nasce, a documentação pode silenciosamente
passar a mentir — e hoje nada percebe.

## 2. Proposta de valor

**O sistema é obrigado a explicar a si mesmo, e a explicação é verificada.** Comando citado existe;
comando que existe é citado; gate que reprova diz como corrigir. Divergência entre o que o Forja
faz e o que ele diz que faz passa a reprovar o gate — em vez de virar armadilha para o próximo
agente.

## 3. User stories

- **Como** agente lendo a documentação, **quero** que todo comando citado exista de verdade,
  **para que** eu não execute um fantasma e conclua que o ambiente está quebrado.
- **Como** operador, **quero** que toda capacidade do registry esteja explicada em algum lugar,
  **para que** eu não descubra por acaso que o framework já fazia o que fui construir à mão.
- **Como** governança, **quero** que a mudança de contrato de um gate **quebre** a doc que o
  descreve errado, **para que** o `tools:doctor` não fique mais um dia sendo apresentado como
  "inventário de ferramentas opcionais" depois de virar gate.
- **Como** quem mantém o framework, **quero** que renomear um comando seja um ato **detectável**,
  **para que** a renomeação não deixe um rastro de documentação morta.

## 4. Critérios de aceite (Definition of Done)

- [ ] AC-1: Check `docs-commands` (`scope: repo`, catálogo de `health.mjs`): todo `npm run <cmd>` /
      `forja <cmd>` citado em `docs/`, `prompts/`, `.claude/agents/`, `AGENTS.md`, `CLAUDE.md` e
      `README.md` existe no registry (ADR-0020).
- [ ] AC-2: **Comandos do projeto gerado não contam.** `start:dev`, `test:cov`, `memory:db:*` e
      afins são do NestJS/Jest do projeto que o Forja **gera**, não do Forja. A allowlist é derivada
      dos geradores, **não escrita à mão** — uma lista manual mente com o tempo (foi a lição do
      `.gitignore` na SPEC-009). 7 dos 11 "fantasmas" da auditoria eram isto.
- [ ] AC-3: Check `commands-documented` (**warn**, `scope: repo`): todo comando do registry é
      mencionado em pelo menos um `.md` versionado. Hoje 2 de 42 não são.
- [ ] AC-4: Check `docs-links` (**warn**, `scope: repo`): todo link markdown relativo entre arquivos
      versionados resolve. `docs/DEPLOYMENT.md` era link para o nada.
- [ ] AC-5: Os três checks entram no `tools:doctor` e, por consequência, no CI — que já roda o
      doctor na matriz (ADR-0024).
- [ ] AC-6: **Severidades honestas.** `docs-commands` é `critical` (comando fantasma faz o agente
      agir errado). `commands-documented` e `docs-links` são `warn` (atrapalham, não impedem). Um
      gate que reprova o que não impede trabalho é um gate que se aprende a ignorar.
- [ ] AC-7: Toda reprovação nomeia **arquivo e linha** e prescreve a correção. O gate que diz "algo
      está errado" sem dizer onde é só mais um step obscuro.
- [ ] AC-8: Testes com fixture para cada check nos dois estados, incluindo o falso positivo do AC-2.
- [ ] AC-9: ADR-0025 registrando a decisão.
- [ ] AC-10: Os 2 comandos órfãos (`workspace:project:check`, `memory:extract`) são documentados —
      ou removidos do registry, se não servirem mais. Capacidade obscura é capacidade morta.

## 5. Escopo

**Dentro**:
- `lib/core/health.mjs` — os três checks novos (o catálogo do repo).
- `lib/core/doc-graph.mjs` — varredura dos `.md` versionados: comandos citados, links relativos.
- Derivação automática da allowlist de comandos do projeto gerado, a partir de `lib/generators/`.
- Documentar os 2 comandos órfãos.
- ADR-0025 + testes.

**Fora** (explícito):
- **Lint de prosa** (estilo, ortografia, tamanho de linha). Isto é `markdownlint`, já previsto no
  ADR-0018 como ferramenta opcional. Aqui só verificamos o que é **verificável contra o código**.
- Validar links **externos** (http). Rede no gate é flakiness garantida.
- Gerar documentação automaticamente a partir do registry. Doc gerada por máquina não explica o
  *porquê*, e o porquê é a parte que importa — o gate cobra que exista, não escreve por você.
- Traduzir os docs em inglês (`token-optimization.md` está em inglês; outros em português). É dívida
  real, mas é outra spec.

## 6. NFRs / restrições

- **Performance**: os três checks são `scope: repo` e só leem `.md` — ficam fora do `SessionStart`
  (que roda `scope: runtime`). O doctor completo continua < 2s.
- **Zero falso positivo crítico**: o AC-2 é a prova de fogo. A auditoria manual acusou 11 comandos,
  e 7 eram legítimos. Um `docs-commands` ingênuo teria "corrigido" a documentação de onboarding
  inteira — pior que não ter check nenhum.
- **Compatibilidade**: aditivo. Nenhum comando existente muda de contrato.

## 7. Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Falso positivo com comandos do projeto gerado | **A** | A | AC-2: allowlist **derivada** dos geradores, nunca manual. Já observado: 7 de 11 |
| Regex casa comando dentro de bloco de exemplo hipotético | M | M | Só `npm run x` / `forja x` em bloco de código. Prosa não conta |
| `commands-documented` vira ruído a cada comando novo | M | B | É `warn`. E documentar comando novo é o comportamento desejado |
| O gate engessa a doc e desestimula escrever | B | M | Ele só cobra referências a **código**; prosa é livre |

## 8. Métricas de sucesso

- **Zero** comandos fantasma na documentação, verificado a cada CI — em vez de a cada auditoria
  manual que alguém lembrar de fazer.
- Renomear um comando passa a **quebrar o CI** enquanto a doc não acompanhar. Hoje renomear é grátis
  e a doc apodrece calada.
- Os 42 comandos do registry passam a ter, cada um, ao menos um lugar onde o sistema explica o que
  ele faz. Nenhum step obscuro.
