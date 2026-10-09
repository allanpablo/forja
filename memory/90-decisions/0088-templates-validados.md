# ADR-0088: Boilerplates como templates validados (`project:new --template`)

- **Status**: accepted
- **Data**: 2026-10-09
- **Autor(es)**: Allan Pablo / Claude
- **Tags**: generation, boilerplates, release, quality

## Contexto

O `boilerplates/README.md` prometia `init-project --template api-rest`, mas a flag nunca existiu.
Testados como estão, nenhum dos seis boilerplates funcionava como ponto de partida:

- `01-api-rest` tem só um README.
- `02-saas` e `03-ecommerce` não instalam: `@nestjs/typeorm@9` com Nest 10 (conflito de peer).
- `04` (microserviços) e `05` (monorepo turbo) têm topologia própria, com vários pacotes.
- `06-clean-arch` instala e passa nos testes, mas `npm run build` chama um `nest` que não está nas
  dependências.

Na mesma época, o NestJS 12 passou a ser ESM-only, e o `nest new` oficial adotou ESM + `nodenext`,
Vitest e oxlint. O backend padrão do gerador (CommonJS + Jest) compilava, mas o `npm test` não
carregava, o lint nunca rodou e o módulo `ops` abria um banco inexistente. O smoke só verificava
compilação, então nada disso aparecia.

## Decisão

1. **"Template" é um contrato.** Um boilerplate só vira template quando o manifest declara
   `"template": true`. Isso promete que o backend instala, compila, passa nos testes e no lint. O job
   de CI `project-smoke-full` cobra a promessa, e `test/templates.test.js` exige que todo template
   esteja na matriz desse job. Os demais boilerplates seguem como **referência**.
2. **`forja project:new <nome> --template <t>`** gera memória e agentes, aplica o boilerplate (código e
   memória específica prevalecem; o README vai para `docs/template.md`), conecta a IA (ADR-0086) e
   registra a origem em `.forja/template.json`. Template desconhecido ou de referência é recusado
   antes de criar qualquer arquivo, com a lista dos disponíveis. `forja project:templates` mostra
   quais são templates e quais são referência.
3. **O backend gerado e o 06-clean-arch seguem o `nest new` do NestJS 12:** ESM, Vitest e oxlint.
   Ficam no TypeScript 6 porque o ecossistema de testes ainda não suporta o 7. O painel `/api/ops`
   do backend padrão lê a memória do Forja (specs, handoffs e nós indexados).
4. **`project:smoke --full` passa a rodar `test`, `test:e2e` (quando declarado) e `lint`**, além de
   install e build. "Compila" deixou de ser critério de aceite para o projeto gerado.

## Alternativas consideradas

- **Migrar os seis boilerplates de uma vez.** Rejeitada para a 5.0: 02 e 03 exigem refazer a camada
  de dados, e 04/05 têm topologia própria. Migrar sem a mesma validação repetiria o problema (promessa
  sem prova). Cada um entra quando passar no `project-smoke-full`.
- **Copiar o boilerplate sem validar.** Rejeitada: era exatamente o que o README prometia, e o
  resultado seriam projetos que não instalam.
- **Manter o backend padrão em CommonJS com Nest 11.** Rejeitada: congelaria o projeto gerado numa
  versão antiga. O padrão oficial do Nest 12 é ESM.

## Consequências

- `clean-arch` é o primeiro template. Promover outro exige migrá-lo e incluí-lo na matriz do CI.
- Projetos gerados antes da v5 continuam em CommonJS + Jest. O `project:upgrade` é aditivo e não
  migra o backend existente.
