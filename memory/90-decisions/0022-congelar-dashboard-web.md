# ADR-0022: Congelar o dashboard web

- **Status**: accepted
- **Data**: 2026-07-09
- **Autor(es)**: apk
- **Tags**: dashboard, cli, release, security, sdd

## Contexto

O dashboard web (`dashboard/`, SPEC-002) foi implementado por inteiro: 15 rotas Fastify,
12 telas React, 68 testes verdes, bundle de 190KB gzip. Entrou no repositório no commit
`b732e08` ("Forja v1.1 — release público inicial", 2026-07-06) e **nunca recebeu uma única
iteração** nos 12 commits seguintes. Não foi abandonado após uso — nasceu sem uso.

Três problemas concretos motivaram a decisão:

1. **Bug de release já publicado.** O `files[]` do `package.json` nunca incluiu `dashboard/`,
   mas incluía `docs/dashboard.md`, e o `package.json` publicado trazia o script
   `"dashboard": "cd dashboard && npm start"`. O `README.md` documentava o comando. Resultado:
   quem instalou o `forja` v1.1.2 do npm recebeu a documentação e o comando, mas não o código.
   O comando quebra. O `release-auditor` não pegou porque valida o que os binários importam,
   não o que a documentação promete.

2. **Segunda fonte de verdade para comandos, já divergente.** O ADR-0020 estabeleceu que todo
   comando de processo passa pelo core (`bin/forja.mjs` + `lib/core/registry.mjs`), com gates
   transversais e auditoria em `.context/forja-runs.jsonl`. O dashboard mantém sua própria
   `COMMAND_ALLOWLIST` hard-coded (decisão D4 da SPEC-002, por razões legítimas de segurança).
   Na auditoria de 2026-07-09: o registry tem 41 comandos, a allowlist expõe 11, e
   **`context:build` existe na allowlist mas não no registry** — executa via
   `node scripts/dev.mjs context:build`, contornando os gates e a trilha de auditoria do core.
   Um comando disparado pelo botão do dashboard não aparece na auditoria.

3. **A documentação pública descrevia errado a superfície.** O `README.md` chamava o dashboard
   de "visão opcional read-only". Ele expõe `POST /api/workflow/:project/run/:role` (dispara
   execução de papéis), além de mutações em status de specs, notas de projeto e comandos.
   A auditoria de RCE prevista na T12 da SPEC-002 nunca foi executada, e teria coberto apenas
   `/api/commands` — as rotas `workflow` e `stacks` sequer existiam quando aquela task foi escrita.

## Decisão

**Congelar o dashboard.** O código permanece em `dashboard/`, versionado e com os testes
passando, mas deixa de ser superfície pública e de ser tratado como parte do produto:

- `docs/dashboard.md` e `specs/agent-dashboard/` saem do `files[]` do pacote npm.
- Os cinco scripts `dashboard*` saem do `package.json` do root (o `package.json` é publicado
  inteiro; não há como ter script "só local").
- `README.md` e `DOC-MAP.md` deixam de prometer o dashboard ao usuário do npm.
- SPEC-002 passa a `abandoned`. O status `parked` não existe no `spec-cli`
  (`draft|review|approved|implementing|done|abandoned`), e `abandoned` é o único que não mente.

**Não unificar `registry` ↔ `allowlist` agora.** Era o caminho tecnicamente correto se o
dashboard tivesse futuro. Sem consumidor, seria infraestrutura elegante sustentando código
que ninguém roda. O `context:build` fantasma deixa de causar dano ao ser congelado junto.

## Alternativas consideradas

- **Arquivar de vez** (mover para `docs/archive/`, fechar a spec como wontfix) — rejeitada
  porque descarta 69 arquivos funcionais e testados por uma decisão reversível. O custo de
  manter o código parado no repo é próximo de zero, uma vez removido das superfícies públicas.
- **Reviver: derivar a allowlist do registry** (campo `exposedToDashboard` + schema de args,
  publicar `dashboard/` no `files[]`, auditar `workflow`/`stacks`) — rejeitada *por ora*
  porque o dashboard nunca teve um usuário. Construir a infraestrutura antes da demanda inverte
  a ordem. Continua sendo o caminho certo **se** a demanda aparecer; ver "Condições de retomada".
- **Manter como está** — rejeitada porque deixa um comando quebrado publicado no npm e um
  bypass da auditoria do ADR-0020 em pé.

## Consequências

**Positivas**:
- O pacote npm para de prometer um comando que não funciona.
- Some a segunda fonte de verdade para comandos; o `bin/forja.mjs` volta a ser a única.
- O bypass de auditoria do `context:build` deixa de ser alcançável.
- A documentação pública passa a descrever a realidade (CLI-first, sem front).
- Zero manutenção contínua: o código congelado não drifta porque não é superfície.

**Negativas / Trade-offs**:
- 69 arquivos funcionais ficam parados no repositório. É dívida visível, mas inerte.
- Quem clonar o repo vê uma pasta `dashboard/` sem entrada óbvia; mitigado por
  `dashboard/README.md` explicando o estado e como subir manualmente.
- Se a demanda por uma interface visual voltar, parte do trabalho de reconciliação
  (rotas novas × allowlist × registry) terá crescido no intervalo.

## Condições de retomada

Descongelar exige, nesta ordem:

1. Um usuário real e um caso de uso que o CLI não atenda. Sem isso, não retomar.
2. Derivar a allowlist do registry — comando novo entra em `lib/core/registry.mjs` com
   `exposedToDashboard: true` e schema de args declarado. Preserva a garantia do D4
   (nada dinâmico, nada de regex, tudo em código) e mata a classe de bugs de sincronização.
3. Auditoria de segurança das rotas mutáveis, com escopo explícito em `/api/commands`,
   `/api/workflow/:project/run/:role` e `/api/stacks` — não apenas a primeira, como previa a T12.
4. Incluir `dashboard/` no `files[]` **antes** de voltar a documentá-lo publicamente.

## Rastreamento

- Implementação congelada: `dashboard/` (15 rotas, 12 telas, 68 testes)
- Spec: `specs/agent-dashboard/` (status `abandoned`)
- Docs: `docs/dashboard.md` (mantido no repo, fora do tarball)
- ADRs relacionadas: ADR-0020 (core CLI única — cuja fronteira o dashboard violava),
  ADR-0021 (guardrails de harness)
