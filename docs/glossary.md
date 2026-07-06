# 📖 Glossário de Termos

**Definições rápidas de conceitos usados no kit.**

---

## A

### ADR (Architecture Decision Record)
Documento que registra uma decisão técnica importante, seu contexto, e consequências.
```
Exemplo: "ADR-001: Usar NestJS como framework backend"
Arquivo: memory/90-decisions/ADR-0001-[titulo].md
```

### Agent (Agente)
Uma IA que trabalha em escopo específico (backend, frontend, segurança, etc).
```
Exemplos: Backend-Agent, Frontend-Agent, Security-Agent, Reviewer-Agent
```

### API Gateway
Ponto de entrada único que roteia requisições para serviços backend.
```
No kit: NestJS app com app.controller.ts
```

---

## B

### Backend
Servidor/API (no kit: NestJS).
```
Localização: backend/src/
Entry point: backend/src/main.ts
```

### Backlog
Lista priorizada de trabalho futuro.
```
No kit: memory/40-delivery/backlog.md
```

### Bounded Context (DDD)
Domínio com responsabilidades claras e isoladas.
```
Exemplos: Auth, Billing, Payments, Notifications
No kit: memory/30-domains/[dominio]/
```

---

## C

### Context Pack
Arquivo que consolida docs prioritárias para carregar numa sessão de IA.
```
Geração: node scripts/build-context-pack.mjs
Arquivo: .context/context-pack.md
```

### Coverage (Cobertura de Teste)
Percentual de código coberto por testes.
```
No kit: npm run test:cov (target: >80%)
```

---

## D

### DTO (Data Transfer Object)
Classe que valida e tipifica dados de entrada/saída.
```
Exemplo:
@IsEmail()
email: string;

No kit: src/features/[dominio]/dto/
```

### Dashboard Operacional
Interface visual de status de agentes, tarefas, handoffs.
```
No kit: GET http://localhost:3000/ops
```

### DDD (Domain Driven Design)
Abordagem que alinha código com domínios de negócio.
```
No kit: memory/30-domains/
```

---

## E

### E2E (End-to-End Testing)
Teste que valida fluxo completo (requisição → resposta).
```
No kit: backend/test/app.e2e-spec.ts
Rodar: npm run test:e2e
```

---

## F

### Feature
Nova funcionalidade ou mudança.
```
Exemplo: "Implementar autenticação JWT"
Registra em: memory/40-delivery/current-sprint.md
```

### FTS5 (Full Text Search)
Indexação de busca por texto em SQLite.
```
No kit: Busca em memory/ via SQLite
```

---

## G

### Generator
CLI que cria novo projeto com toda estrutura. Os projetos vão para o workspace Forja (`~/forja-workspace/projects/<nome>`).
```
Comando: npm run project:new meu-projeto
Arquivos: bin/init-project.js, bin/create-memory-nest-kit.js
```

---

## H

### Handoff
Transferência formal de contexto entre agentes.
```
Campos: contexto, alterações, riscos, pendências, próximo passo
No kit: memory/50-orchestration/handoffs/
Criar: node scripts/append-handoff.mjs agente-a agente-b "título"
```

### Health Check
Endpoint que verifica se API está UP.
```
No kit: GET /api/health
Esperado: { "status": "ok" }
```

---

## I

### Index (Índice)
Estrutura que acelera buscas (SQLite FTS5).
```
No kit: memory/ → .memory/sqlite/context.db
Sync: npm run memory:db:sync
```

---

## J

### JWT (JSON Web Token)
Token de autenticação com assinatura criptográfica.
```
Uso: Authorization header
Exemplo: Authorization: Bearer eyJhbGc...
```

---

## K

### Knowledge Base
Conjunto de documentos que formam a "memória" do projeto.
```
No kit: memory/ + agents/ + skills/ + prompts/
```

---

## L

### Lint
Ferramenta que verifica erros e padrões de código.
```
No kit: ESLint
Rodar: npm run lint
```

---

## M

### Memory (Memória do Projeto)
Documentação estruturada em 10 camadas.
```
No kit: memory/ com diretórios 00-global até 90-decisions
Sincronização: .memory/sqlite/context.db
```

### Module (NestJS)
Agrupamento de componentes relacionados.
```
Exemplo: AuthModule, UsersModule, etc
Estrutura: module.ts, controller.ts, service.ts
```

### Middleware
Código executado antes/depois de requisição.
```
Exemplo: Rate limiting, CORS, autenticação
No kit: backend/src/middleware/
```

---

## N

### NestJS
Framework backend profissional (Node.js + TypeScript).
```
No kit: backend/
Docs: https://docs.nestjs.com
```

### NFR (Non-Functional Requirement)
Requisitos de qualidade (performance, segurança, escalabilidade).
```
No kit: memory/10-product/nfrs.md
```

---

## O

### Orchestrator (Orquestrador)
Agente ou pessoa que decompõe trabalho entre workers.
```
Responsabilidades: Planejamento, decomposição, consolidação
No kit: prompts/multi-agent-orchestrator.md
```

### OPS
Dashboard operacional (status de agentes).
```
No kit: GET /ops
Módulo: backend/src/modules/ops/
```

---

## P

### Persona
Tipo de usuário do kit (Executivo, Arquiteto, Developer, QA).
```
No kit: docs/personas/{executive,architect,developer,qa}/
```

### Prettier
Ferramenta de formatação automática de código.
```
No kit: npm run format
Config: backend/.prettierrc
```

---

## R

### Roadmap
Planejamento de releases/sprints.
```
No kit: memory/40-delivery/roadmap.md
```

### Reviewer
Agente responsável por validar qualidade e segurança.
```
Responsabilidades: Revisar riscos, bloquear código ruim
```

---

## S

### Skill (Habilidade)
Capacidade reutilizável de um agente.
```
Exemplos: Triage, Compaction, Handoff, Self-Healing
No kit: skills/*/SKILL.md
Descoberta: skills/MANIFEST.json
```

### Smart Context
Técnica de carregar apenas contexto relevante (não tudo).
```
Benefício: Reduz tokens de 10K → 1000
No kit: scripts/build-smart-context.js
```

### Sprint
Ciclo de desenvolvimento (típico: 1 semana).
```
No kit: memory/40-delivery/current-sprint.md
Gerenciar: npm run sprint:start
```

### SQLite
Banco de dados leve, em-arquivo.
```
No kit: .memory/sqlite/context.db
Schema: backend/scripts/memory-db-schema.sql
```

---

## T

### TypeScript
Linguagem tipada que compila para JavaScript.
```
No kit: Código em backend/src/
Config: backend/tsconfig.json
```

### Triage
Classificação/priorização de tarefas.
```
Categorias: Rápido (<1h), Médio (1-8h), Complexo (>8h)
No kit: skills/triage-task/SKILL.md
```

---

## U

### Unit Test
Teste que valida uma função/método isolada.
```
No kit: backend/src/**/*.spec.ts
Rodar: npm test
```

---

## V

### Validation (Validação)
Verificação que dados estão corretos antes de processar.
```
No kit: DTO com decoradores @IsEmail, @IsString, etc
Automático: Middleware de validação NestJS
```

### Vector Search
Busca por similaridade semântica (embeddings).
```
Não no kit (futuro)
Alternativa: FTS5 (busca por texto)
```

---

## W

### Watcher (Memory Watcher)
Processo que monitora mudanças em markdown e auto-sincroniza.
```
No kit: scripts/memory-watcher.mjs
Execução: node scripts/memory-watcher.mjs
Automático ao salvar arquivos
```

### Worker
Agente que executa uma subtarefa específica.
```
Exemplos: Backend-Worker, Frontend-Worker, DBA-Worker
Responsabilidade: Escopo isolado e claro
```

---

## X

### (Vazio - começa com Y)

---

## Y

### (Nenhum termo padrão começa com Y no kit)

---

## Z

### (Nenhum termo padrão começa com Z no kit)

---

## Siglas Rápidas

| Sigla | Significado |
|-------|-------------|
| API | Application Programming Interface |
| CRUD | Create, Read, Update, Delete |
| DTO | Data Transfer Object |
| DDD | Domain Driven Design |
| E2E | End-to-End Testing |
| FTS | Full Text Search |
| HTTP | HyperText Transfer Protocol |
| JWT | JSON Web Token |
| ORM | Object-Relational Mapping |
| REST | Representational State Transfer |
| SQL | Structured Query Language |
| TTL | Time To Live |
| UI | User Interface |

---

## 🎯 Por Contexto

### Ao ler docs
- **Handoff**: Leia sobre transferência entre agentes
- **ADR**: Decisões técnicas registradas
- **Memory**: Estrutura de documentação

### Ao codificar
- **DTO**: Validação de entrada
- **Module**: Organização de código
- **Middleware**: Lógica transversal

### Ao testar
- **Unit Test**: Teste isolado
- **E2E**: Teste completo
- **Coverage**: Percentual coberto

### Ao orquestrar
- **Skill**: Capacidade reutilizável
- **Orchestrator**: Decomposição
- **Handoff**: Transferência

---

**Última atualização:** 2026-05-02  
📌 Bookmark este arquivo!
