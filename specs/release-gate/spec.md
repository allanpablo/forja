# Spec: release-gate

- **ID**: SPEC-010
- **Status**: done
- **Owner**: apk
- **Criado em**: 2026-07-13
- **Sprint alvo**: S?
- **ADRs relacionadas**: [ADR-0023](../../memory/90-decisions/0023-doctor-como-gate-do-nucleo.md) (doctor como gate do núcleo), [ADR-0021](../../memory/90-decisions/0021-guardrails-de-harness.md) (guardrails de harness), [ADR-0020](../../memory/90-decisions/0020-forja-core-cli-unica.md) (core/registry), [ADR-0018](../../memory/90-decisions/0018-ferramentas-de-processo.md) (ferramentas de processo)

## 1. Problema

**O repositório mente sobre o pacote.** No repo tudo resolve: `node_modules` tem as devDeps, todo
arquivo está presente, o `cwd` é a raiz. Nada disso vale para quem roda `npm i -g forjajs`. Entre o
repo e o tarball existe uma fronteira que nenhum teste atravessa — e ela já cedeu **três vezes**:

| Versão | O que foi publicado | Consequência |
|---|---|---|
| ADR-0021 §2 | `better-sqlite3` como `devDependency` | Dez comandos estouravam com `ERR_MODULE_NOT_FOUND` numa instalação limpa. O `forja` sem argumentos funcionava — o help não carrega os scripts — o que mascarava a quebra. |
| v1.1.1 | `otplib` e `qrcode` no tarball, **sem jamais existirem no git** | `npm publish` empacota o *disco*, não o commit. Um `npm install` casual entre a auditoria e o publish reescreveu o `package.json`. |
| v1.1.3 | `docs/dashboard.md` e o script `npm run dashboard`, sem a pasta `dashboard/` | Quem instalava recebia a documentação e o comando, sem o código. |

Três ocorrências, uma classe: **o que é publicado não é o que o repositório promete.** Todas
descobertas *depois* do publish, na máquina de quem instalou.

O agente `.claude/agents/release-auditor.md` descreve essa classe com precisão cirúrgica — as
quatro variantes, o procedimento, os comandos. Mas ele é **um agente**: prosa, opt-in, invocado por
quem lembrar. Pelo critério do próprio ADR-0021 — *"uma regra que depende de memória não é uma
regra; é uma sugestão"* — isto não é gate. É a última fronteira do framework que ainda funciona por
disciplina em vez de por harness.

Não é conhecimento que falta. É **execução**.

## 2. Proposta de valor

Publicar deixa de ser um ato de fé: **nenhuma versão sai sem prova de que uma instalação limpa
funciona**, e a prova é gerada pelo harness, não pela lembrança de quem publica.

## 3. User stories

- **Como** quem publica, **quero** que o `npm publish` seja **bloqueado** quando o tarball está
  quebrado, **para que** eu não descubra pela issue de um usuário.
- **Como** quem publica, **quero** que árvore suja reprove antes de qualquer outra checagem,
  **para que** não se repita a v1.1.1 — auditar um tarball que não é o que será publicado é
  auditar ficção.
- **Como** usuário do `forjajs`, **quero** que todo comando anunciado exista de verdade no pacote,
  **para que** `npm i -g forjajs` não me entregue documentação sem código.
- **Como** governança, **quero** a evidência da instalação limpa **no log do CI**, **para que**
  "testado" seja um artefato verificável e não uma afirmação.

## 4. Critérios de aceite (Definition of Done)

- [ ] AC-1: Existe `npm run release:check` (entrada no registry, ADR-0020) que empacota, instala num
      diretório temporário isolado e **reprova com exit ≠ 0** em qualquer uma das falhas abaixo.
- [ ] AC-2: **Árvore limpa é pré-condição.** Qualquer saída de `git status --short` reprova
      imediatamente, antes de empacotar. Foi a falha da v1.1.1, e nenhuma instalação a pega.
- [ ] AC-3: **Instalação limpa real**: `npm pack` → `npm i <tgz>` fora do repo, sem devDeps.
- [ ] AC-4: **Comandos são executados, não listados.** O `forja` sem argumentos passa mesmo com tudo
      quebrado (o help não carrega os scripts). O gate roda os comandos sem efeito colateral
      (`tools:doctor`, `code:status`, `query:universal`, help) e reprova em `ERR_MODULE_NOT_FOUND`.
- [ ] AC-5: **Todo comando do registry tem seu script no tarball.** Hoje são 41/41 — o gate torna
      isso permanente, em vez de verdade acidental.
- [ ] AC-6: **Fronteira deps/devDeps nos dois sentidos**: todo pacote importado por código sob
      `files[]` está em `dependencies`; e toda `dependency` declarada é importada por alguém — peso
      morto viaja no tarball de todo usuário.
- [ ] AC-7: **Imports em template literal não contam.** Os geradores contêm código NestJS que eles
      *escrevem*, não que *executam*. Contá-los produz falso positivo.
- [ ] AC-8: `release:check` roda como **`prepublishOnly`** e como **step do CI**. Um gate que só roda
      quando alguém lembra é o problema, não a solução.
- [ ] AC-9: `tools:doctor` também vira step do CI — o gate do ADR-0023 existe e hoje nada o executa
      automaticamente.
- [ ] AC-10: O agente `release-auditor` passa a **consumir o gate**, em vez de manter procedimento
      próprio em prosa. Deixa de ser a fonte da verdade e passa a interpretá-la.
- [ ] AC-11: `runtime-deps` (ADR-0023) endurecido contra o falso positivo do AC-7. Hoje ele passa
      **por sorte**: `@nestjs/*` não está nas devDeps. No dia em que estiver, ele trava o gate.
- [ ] AC-12: Testes cobrindo cada reprovação com tarball de fixture deliberadamente quebrado.

## 5. Escopo

**Dentro**:
- `lib/core/release.mjs` — as checagens como dados, no mesmo formato de `lib/core/health.mjs`
  (`{ id, severity, probe, fix }`). Mesma filosofia, fronteira diferente.
- `scripts/release-check.mjs` — superfície de apresentação + exit code.
- `package.json` (`prepublishOnly`) e `.github/workflows/` (steps de `release:check` e `tools:doctor`).
- `lib/core/health.mjs` — endurecer `runtime-deps` (AC-11).
- `.claude/agents/release-auditor.md` — reescrito para consumir o gate.

**Fora** (explícito):
- **Publicar automaticamente.** O gate autoriza; quem publica é humano. Automatizar o `npm publish`
  é a classe de risco oposta à que esta spec fecha.
- Mudar o conteúdo de `files[]` — o gate *verifica* o que está lá; não decide o que deveria estar.
- Assinatura/proveniência de pacote (npm provenance) — vale a pena, mas é outra spec.
- Testar os projetos **gerados** pelos boilerplates. É uma fronteira real e descoberta, mas grande
  demais para entrar aqui de carona.

## 6. NFRs / restrições

- **Honestidade acima de velocidade**: o gate instala de verdade. Vai levar dezenas de segundos, e
  tudo bem — roda antes de publicar e no CI, não a cada commit.
- **Isolamento**: a instalação acontece fora do repo, em diretório temporário, sem herdar
  `node_modules` nem `NODE_PATH`. Um gate que enxerga o repo não prova nada.
- **Zero falso positivo crítico**: melhor deixar passar um caso duvidoso do que reprovar um release
  saudável. Análise estática ambígua vira `warn`, nunca `fail`.
- **Compatibilidade**: não altera nenhum comando existente. `release:check` é aditivo.

## 7. Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Gate lento e as pessoas o contornam | M | A | Só em `prepublishOnly` e CI; nunca no pre-commit |
| Falso positivo por template literal nos geradores | **A** | A | AC-7 e AC-11; ambíguo vira `warn`. **Já observado em campo** |
| Instalação "vaza" para o repo (cache, `NODE_PATH`) e o gate mente verde | M | A | Diretório temporário + `npm init` próprio; teste que injeta tarball quebrado e **exige** reprovação |
| `prepublishOnly` não roda em todos os fluxos de publish | B | A | Duplicado como step de CI — duas portas, não uma |
| Escopo escorrega para "testar os projetos gerados" | M | M | Explicitamente fora |

## 8. Métricas de sucesso

- **Zero** bugs da classe "publicado ≠ repositório" nos 90 dias após a 1.1.4. Foram três em três
  releases; a régua é chegar a zero — e provar.
- A evidência da instalação limpa passa a existir **no log do CI de cada release**, em vez de na
  memória de quem publicou.
- Os três bugs históricos viram fixture: cada um, reintroduzido, **reprova** o gate. Um gate que
  nunca viu a falha que promete pegar não está testado — está escrito.
