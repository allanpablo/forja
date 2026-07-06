# Guia de Onboarding do Projeto

Este documento ensina como iniciar, estruturar, executar e validar um projeto usando o scaffold `create-memory-nest-kit`.

## 1) Objetivo do Guia

Ao final deste guia, a pessoa responsável deve conseguir:
- criar um projeto com `npx`
- entender a estrutura de memória/documentação
- gerar e revisar os steps de execução
- questionar o plano antes de executar
- validar com checklist técnico e de produção
- realizar go-live com segurança

## 2) Pré-requisitos

- Node.js 18+
- npm 9+
- Git instalado
- Conta GitHub (se for publicar remoto)
- (Opcional) Conta npm (se for publicar pacote)

Validação rápida:

```bash
node -v
npm -v
git --version
```

## 3) Criar Projeto com npx

### Opção A: via GitHub

```bash
npx github:SEU_USUARIO/create-memory-nest-kit nome-do-projeto
```

### Opção B: via npm

```bash
npx create-memory-nest-kit@latest nome-do-projeto
```

### Opção C: local (desenvolvimento)

```bash
node ./bin/create-memory-nest-kit.js nome-do-projeto
```

Entrar no projeto:

```bash
cd nome-do-projeto
```

## 4) Estrutura Gerada (resumo)

- `memory/`: base de contexto e continuidade
- `agents/`: responsabilidades por tipo de agente
- `skills/`: playbooks operacionais reutilizáveis
- `prompts/`: templates de orquestração e execução
- `scripts/`: utilitários de contexto e handoff
- `backend/`: API NestJS base
- `.memory/sqlite/`: índice SQLite operacional

## 5) Primeiro Setup

### 5.1 Backend

```bash
cd backend
npm install
npm run start:dev
```

Checagem esperada:
- API sobe sem erro
- rota de saúde responde (`/api/health`)

### 5.2 Memória operacional (SQLite)

Ainda dentro de `backend/`:

```bash
npm run memory:db:init
npm run memory:db:sync
npm run memory:db:query -- "search" "contexto" 10
```

O que isso faz:
- `init`: cria schema do banco de memória
- `sync`: indexa os markdowns (memory/docs/agents/skills/prompts)
- `query`: consulta rápida de contexto

## 6) Como Gerar os Steps do Projeto

Use este fluxo para definir plano e execução:

1. Ler contexto mínimo:
- `memory/00-global/*`
- `memory/10-product/*`
- `memory/20-architecture/*`
- `memory/40-delivery/current-sprint.md`

2. Criar plano inicial em `memory/40-delivery/current-sprint.md` com:
- objetivo
- steps técnicos
- riscos
- dono por step

3. Quebrar em subtarefas (se necessário) no padrão multiagente:
- Orchestrator define escopo
- Worker por domínio executa
- Reviewer valida

4. Registrar handoffs:

```bash
node scripts/append-handoff.mjs orchestrator backend-nest "implementar modulo auth"
```

5. Atualizar resumo operacional:
- `memory/70-summaries/global-summary.md`
- `memory/70-summaries/domain-summary.md`

## 7) Questionando os Steps (obrigatório)

Antes de executar qualquer step, responder:

### 7.1 Clareza
- O step está claro e testável?
- O resultado esperado está explícito?

### 7.2 Dependências
- Esse step depende de outro?
- Há bloqueio externo (infra, credencial, API de terceiro)?

### 7.3 Risco
- Qual risco funcional?
- Qual risco de segurança?
- Qual risco de regressão?

### 7.4 Observabilidade
- Como saber se deu certo?
- Que métrica/log/teste confirma o sucesso?

### 7.5 Rollback
- Se falhar, como desfazer com segurança?

Se qualquer resposta estiver fraca, o step volta para refinamento antes de execução.

## 8) Critério de Pronto por Step (Definition of Done)

Um step só é concluído quando:
- código implementado
- teste mínimo executado
- risco registrado
- documentação atualizada
- resumo/handoff atualizado (se houve troca de agente)

## 9) Validação Pré-Produção

Checklist mínimo:

### 9.1 Técnica
- build ok
- testes críticos ok
- lint/qualidade ok
- migrations validadas (se houver)

### 9.2 Segurança
- sem segredo hardcoded
- validação de entrada ativa
- autorização revisada
- logs sem dados sensíveis

### 9.3 Operação
- healthcheck ok
- monitoramento/alertas definidos
- rollback pronto e testado

### 9.4 Produto
- critérios de aceite atendidos
- fluxos críticos validados com negócio

## 10) Go/No-Go para Produção

Regra prática:
- **GO**: todos checklists verdes + riscos aceitáveis + rollback pronto
- **NO-GO**: qualquer falha crítica em segurança, integridade de dados ou indisponibilidade sem plano de retorno

Template de decisão:

```text
Decisão: GO | NO-GO
Data:
Responsável:
Motivos:
Riscos remanescentes:
Plano de rollback:
```

## 11) Pós-Deploy (produção)

Após subir:
- monitorar logs e métricas por janela definida
- validar rotas críticas
- registrar resultado em `memory/60-runs/` e resumo em `memory/70-summaries/global-summary.md`

Template pós-deploy:

```text
Deploy realizado em:
Versão:
Status inicial:
Incidentes:
Ações corretivas:
Próximos passos:
```

## 12) Fluxo Recomendado de Trabalho Diário

1. Sincronizar memória:
```bash
cd backend
npm run memory:db:sync
```

2. Buscar contexto da tarefa:
```bash
npm run memory:db:query -- "search" "tema da tarefa" 10
```

3. Executar step
4. Atualizar docs + resumo
5. Registrar handoff (se houver troca de responsável)

## 13) Erros Comuns e Como Evitar

- Erro: executar sem refinar step.
  - Evitar: aplicar seção 7 (questionamento obrigatório).

- Erro: esquecer atualização de memória.
  - Evitar: sempre rodar `memory:db:sync` após mudanças relevantes.

- Erro: deploy sem rollback claro.
  - Evitar: incluir rollback como item obrigatório no DoD.

- Erro: contexto disperso em chat apenas.
  - Evitar: registrar decisão em `memory/90-decisions` e resumo em `memory/70-summaries`.

## 14) Comandos Rápidos (cola)

```bash
# criar projeto
npx github:SEU_USUARIO/create-memory-nest-kit nome-do-projeto

# setup inicial
cd nome-do-projeto/backend
npm install
npm run memory:db:init
npm run memory:db:sync
npm run start:dev

# consultar contexto
npm run memory:db:query -- "search" "auth" 10

# registrar handoff (na raiz do projeto)
cd ..
node scripts/append-handoff.mjs orchestrator backend-nest "step de auth"
```

---

## 15) Ponto Mais Importante

Este projeto foi desenhado para **não perder contexto operacional**.
A disciplina de documentação + handoff + resumo é parte da entrega, não “extra”.
