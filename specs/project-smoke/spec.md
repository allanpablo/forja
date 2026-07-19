# Spec: project-smoke

- **ID**: SPEC-015
- **Status**: done
- **Owner**: apk
- **Criado em**: 2026-07-19
- **ADRs relacionadas**: [ADR-0024](../../memory/90-decisions/0024-release-gate.md) (gate do tarball — o padrão), [ADR-0023](../../memory/90-decisions/0023-doctor-como-gate-do-nucleo.md) (doctor), [ADR-0020](../../memory/90-decisions/0020-forja-core-cli-unica.md) (core/registry)

## 1. Problema

O `release:check` guarda uma fronteira: **o repositório mente sobre o pacote**. Existe a *mesma
classe de bug um nível acima*, e ela está **descoberta**: nada prova que `forja project:new` gera um
projeto que de fato **é coerente e roda**.

O gerador escreve arquivos a partir de templates (`{{FEATURE}}`, `{{ID}}`, blocos de `scripts`, configs
multi-IA). Cada um desses é uma oportunidade de mentira silenciosa:

- um placeholder `{{...}}` que vaza para o output porque o gerador esqueceu de substituir;
- um `package.json` gerado que não é JSON válido, ou sem os scripts que os docs prometem;
- a estrutura de memória incompleta (falta um diretório crítico que o resto assume);
- no limite: o projeto gerado simplesmente **não buildar**.

Hoje só descobrimos isso quando um usuário gera um projeto e ele quebra — exatamente o modo de falha
que o `release:check` existe para eliminar, só que na saída do gerador em vez do tarball. **Não é
conhecimento que falta** (o `structure-validator` já sabe validar estrutura). **É execução**: nada
roda o gerador de ponta a ponta e reprova.

## 2. Proposta de valor

Gerar um projeto deixa de ser um ato de fé: **nenhuma mudança no gerador passa sem prova de que o
projeto gerado é coerente**, e a prova é gerada pelo harness — não pela lembrança de quem tocou no
template.

## 3. User stories

- **Como** quem mantém o gerador, **quero** que uma mudança que quebra o output **reprove no CI**,
  **para que** eu não descubra pela issue de um usuário.
- **Como** usuário do `forjajs`, **quero** que `forja project:new` me entregue um projeto sem
  placeholders vazados nem `package.json` quebrado, **para que** eu não perca a primeira hora
  depurando o scaffold em vez do meu produto.
- **Como** governança, **quero** a evidência de que o projeto gerado buildar **no log do CI**,
  **para que** "o gerador funciona" seja um artefato verificável e não uma afirmação.

## 4. Critérios de aceite (Definition of Done)

- [ ] AC-1: Existe `forja project:smoke` (entrada no registry, ADR-0020) que **gera um projeto num
      diretório temporário isolado** e reprova com exit ≠ 0 em qualquer falha abaixo. Limpa o tmp
      sempre, inclusive quando um check lança.
- [ ] AC-2: **Zero placeholder vazado.** Nenhum arquivo gerado contém `{{...}}` não substituído.
      É o bug mais barato de introduzir e o mais visível para o usuário.
- [ ] AC-3: **Todo `package.json` gerado é JSON válido** e contém os scripts que o gerador anuncia.
- [ ] AC-4: **Estrutura íntegra.** `validateProjectStructure` do projeto gerado passa (reusa o
      `structure-validator` existente — uma máquina, não duas).
- [ ] AC-5: **Modo `--full` (opt-in): o projeto buildar de verdade.** `npm install` + `npm run build`
      no backend gerado, num ambiente isolado. É o análogo do clean-install do `release:check`:
      caro, roda antes de release, não a cada commit.
- [ ] AC-6: **Reusa o runner de `checks.mjs`.** O `project:smoke` é um catálogo novo consumido pelo
      mesmo runner do doctor/release — mesma máquina de probes, `severity`, cascata por `dependsOn`.
- [ ] AC-7: O gate roda no CI (tier barato) e o `tools:doctor` **não** o executa (custo alto; é um
      gate próprio, como o `release:check`).

## 5. Escopo

**Dentro**:
- Comando `project:smoke` + catálogo `lib/core/project-smoke.mjs`.
- Isolamento em tmp + limpeza garantida (padrão do `withCleanInstall`).
- Tier barato (placeholders, JSON, estrutura) no CI; tier `--full` (install+build) opt-in.

**Fora** (explícito):
- Rodar a suíte de testes do projeto gerado (`npm test`) — fica para uma iteração futura; build já
  prova que os imports resolvem.
- Validar os boilerplates de stack individualmente (`api-rest`, `saas`, …) — este gate cobre o
  caminho default do gerador; a matriz de stacks é escopo à parte.
- Publicar o projeto gerado em qualquer lugar.

## 6. NFRs / restrições

- **Compatibilidade**: não muda o comportamento de `init-project`/`create-memory-nest-kit` — só os
  observa. O gerador não sabe que está sendo auditado.
- **Isolamento**: o tier `--full` roda `npm install` fora do repo, com o ambiente limpo (sem
  `NODE_PATH`/`npm_config_*` herdados — a lição do `release:check`).
- **Custo**: o tier barato roda em segundos (sem rede); o `--full` é minutos (baixa NestJS).

## 7. Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| `--full` flaky por rede (npm registry) | M | M | tier barato é o gate de CI; `--full` é opt-in/pré-release, como o clean-install |
| Gerador tem efeitos colaterais fora do tmp | B | A | gerar sempre com destino explícito no tmp; o teste falha alto se escrever fora |
| Duplicar lógica de validação | B | M | reusar `structure-validator` e o runner de `checks.mjs` — AC-4/AC-6 |

## 8. Métricas de sucesso

30 dias após o release: **pelo menos uma regressão do gerador pega pelo gate antes do merge** (a
prova de que a fronteira estava mesmo descoberta), e **zero issue de usuário sobre scaffold quebrado**
(placeholder vazado, `package.json` inválido).
