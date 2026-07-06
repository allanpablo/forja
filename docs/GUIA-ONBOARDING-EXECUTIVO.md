# Guia Executivo de Onboarding (1 página)

## Objetivo
Garantir que o projeto seja iniciado, executado e levado para produção sem perda de contexto, com governança de decisão e risco.

## Resultado Esperado
- Time alinhado em objetivos e escopo.
- Execução com steps claros, donos e critérios de pronto.
- Decisão Go/No-Go baseada em evidências.
- Continuidade operacional via documentação + handoff + resumos.

## Como Iniciar (rápido)
1. Criar projeto com scaffold:
```bash
npx github:SEU_USUARIO/create-memory-nest-kit nome-do-projeto
```
2. Subir backend e memória operacional:
```bash
cd nome-do-projeto/backend
npm install
npm run memory:db:init
npm run memory:db:sync
npm run start:dev
```

## Governança Mínima
- **Fonte da verdade**: markdown versionado (`memory/`, `docs/`).
- **Índice operacional**: SQLite para busca rápida de contexto.
- **Decisões arquiteturais**: ADR obrigatório para mudanças estruturais.
- **Troca entre responsáveis**: handoff obrigatório.

## Modelo de Execução
- Orquestrador decompõe o plano em steps menores.
- Workers executam por ownership de arquivo.
- Reviewer valida regressão, segurança e qualidade.
- Resumos globais/dominio são atualizados ao final de cada ciclo.

## Indicadores de Controle
- % steps com DoD completo
- # riscos críticos abertos
- cobertura de testes críticos
- incidentes pós-deploy
- tempo médio de handoff

## Gate de Produção (Go/No-Go)
### GO apenas se:
- build/testes/lint críticos verdes
- segurança validada (segredos, auth, validação de entrada)
- rollback definido e testado
- critérios de aceite aprovados

### NO-GO se:
- risco crítico sem mitigação
- falha de segurança/integridade
- ausência de rollback executável

## Responsabilidade da Liderança
- Cobrar clareza do plano e dos riscos antes da execução.
- Bloquear deploy sem checklist completo.
- Garantir atualização de documentação como parte da entrega.

## Mensagem-chave
O projeto não depende de “memória da conversa”; depende de disciplina de documentação operacional e decisão rastreável.
