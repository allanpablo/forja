# ForjaJS 2.0 — Visão

## Problema

Agentes de desenvolvimento conseguem editar código, mas não mantêm memória verificável,
limites de autonomia, contexto econômico ou uma trilha uniforme de decisão. O ForjaJS 1.x
resolve parte disso como CLI; a 2.0 transforma essas capacidades em contratos e serviços
programáveis, preservando a operação CLI-first.

## Usuário principal e casos de uso

O usuário principal é o desenvolvedor solo ou time pequeno que opera um ou mais repositórios
com agentes. Casos prioritários:

- descobrir e executar uma capability com entrada e saída validadas;
- executar uma tarefa supervisionada, pausá-la e retomá-la com checkpoint;
- entregar contexto mínimo baseado em memória, grafo, evidência e orçamento;
- bloquear escrita, rede ou ações destrutivas por política;
- revisar um resultado com evidências independentes antes de marcar a tarefa concluída;
- consumir o mesmo núcleo pela CLI, SDK, MCP, worker e backend.

## Proposta de valor verificável

ForjaJS 2.0 é uma plataforma local-first para memória, contexto, execução, governança e
autonomia de agentes de desenvolvimento. A promessa é limitada às seguintes provas:

| Promessa | Prova esperada |
| --- | --- |
| Ações descobríveis | registry versionado e introspectável |
| Autonomia limitada | decisão de política, aprovação, orçamento e sandbox por execução |
| Memória confiável | evidência, validade temporal e status de conhecimento |
| Contexto econômico | refs, checksums, cache e métricas de tokens |
| Falsa conclusão bloqueada | validator independente com resultado estruturado |

## Diferenciação técnica

CLIs de agentes normalmente são superfícies de comando; frameworks de agentes normalmente
orquestram loops; ferramentas de memória normalmente não governam execução. O Forja combina
essas três preocupações em um núcleo de domínio independente de framework, com adapters para
CLI, MCP, REST, SQLite e NestJS. GraphLoop é o grafo verificável de trabalho e contexto; não
é apenas um índice de símbolos.

## Princípios

1. local-first e offline por padrão;
2. domínio independente de NestJS, Next.js, transporte e persistência;
3. contratos versionados, validação na entrada e resultados auditáveis;
4. determinismo antes de LLM;
5. autonomia supervisionada por padrão;
6. contexto mínimo suficiente e orçamento explícito;
7. migração 1.x aditiva e não destrutiva;
8. evidência separada de afirmação e hipótese.

## Fora do escopo da 2.0 inicial

Hospedagem multi-tenant, execução remota obrigatória, dependência de um provedor de LLM,
treinamento de modelos, substituição de Git, IDE própria, sincronização em nuvem obrigatória
e dashboard como requisito para operar o produto.

## Sucesso e métricas

O release candidate deve demonstrar: uma IA descobre uma capability sem documentação humana,
executa uma tarefa supervisionada, pausa/retoma, é bloqueada por política e não conclui sem
validação. Métricas mínimas: taxa de execuções auditadas, taxa de bloqueios corretos, taxa de
retomada, tokens por tarefa, cache hit rate, retrabalho, afirmações sem evidência e falhas de
validator.

## Estratégia de entrega

A 2.0 será incremental: primeiro contratos e registry; depois runtime controlado, policy,
sprint/task/handoff, MCP/Nest, GraphLoop/contexto, autonomia, multiagente, dashboard e plugins.
O ForjaJS 1.x continua sendo a superfície CLI compatível durante a migração.
