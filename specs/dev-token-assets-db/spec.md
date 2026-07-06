# Spec: dev-token-assets-db

- **ID**: SPEC-DEV-TOKEN-ASSETS-001
- **Status**: done
- **Owner**: orchestrator
- **Criado em**: 2026-06-02
- **Sprint alvo**: refinamento-cli-2026-06
- **ADRs relacionadas**: ADR-0003, ADR-0005, ADR-0007, ADR-0008, ADR-0009

## 1. Problema
O framework ja possui SDD, GSD, memoria SQLite, boilerplates e design-md, mas ainda consome contexto demais porque nao ha gate de budget por tarefa, resumo compacto por sprint, brief de agente ou catalogo operacional dos assets. Boilerplates e design system tambem existem como arquivos soltos, sem indice consultavel no banco.

## 2. Proposta de valor
Transformar contexto, boilerplates, referencias de design e metadados de specs em ativos operacionais compactos, consultaveis por CLI e armazenaveis no SQLite, reduzindo tokens e aumentando velocidade de desenvolvimento.

## 3. User stories
- **Como** Orchestrator, **quero** gerar um sprint pack compacto, **para que** qualquer agente comece com contexto minimo suficiente.
- **Como** Worker, **quero** receber um agent brief por papel e feature, **para que** eu nao precise carregar spec/plan/tasks inteiros sempre.
- **Como** Governance, **quero** bloquear contextos acima do budget, **para que** a operacao nao desperdice tokens.
- **Como** Architect, **quero** catalogar boilerplates e referencias de design, **para que** a escolha de base tecnica/visual seja rastreavel.
- **Como** operador do framework, **quero** metadados no SQLite, **para que** memoria, specs e assets sejam consultaveis sem varrer o repositorio inteiro.

## 4. Criterios de aceite
- [x] AC-1: `npm run context:budget -- <slug|arquivo>` estima tokens e falha acima do limite.
- [x] AC-2: `npm run context:sprint` gera `.context/sprint-pack.md`.
- [x] AC-3: `npm run agent:brief -- <role> <slug>` gera brief compacto por papel.
- [x] AC-4: `npm run catalog:assets` gera catalogo de boilerplates/design-md.
- [x] AC-5: `npm run memory:schema` cria tabelas auxiliares para summaries, context runs e asset catalog.
- [x] AC-6: boilerplates tem manifests padronizados com stack, casos de uso, comandos e gates.
- [x] AC-7: design-md tem tokens/padroes normalizados por superficie.
- [x] AC-8: `sync:universal` popula tabelas auxiliares automaticamente.

## 5. Escopo
**Dentro**:
- CLI para budget, sprint pack, agent brief e catalogo.
- Schema auxiliar SQLite para armazenamento melhor.
- Documentacao operacional da estrategia.

**Fora**:
- Reescrever todos os boilerplates nesta primeira tranche.
- Migrar dashboard web.
- Implementar embeddings vetoriais.

## 6. NFRs / restricoes
- Compatibilidade: manter scripts existentes.
- Token economy: contextos operacionais devem ficar abaixo de 8k tokens por padrao.
- Banco: tabelas novas devem ser aditivas, sem quebrar `memory_nodes` ou `handoffs`.
- Operacao: tudo deve rodar por CLI.

## 7. Riscos e mitigacao
| Risco | Probabilidade | Impacto | Mitigacao |
|---|---|---|---|
| Catalogo virar mais uma fonte duplicada | M | M | Gerar via CLI a partir dos arquivos reais |
| Budget bloquear contexto necessario | M | B | Permitir limite customizado por argumento |
| Schema auxiliar ficar desssincronizado | M | M | Planejar AC-8 para integrar ao sync |

## 8. Metricas de sucesso
Em 30 dias, reduzir em pelo menos 40% o tamanho medio do contexto inicial por tarefa e manter `context:budget` verde em entregas novas.
