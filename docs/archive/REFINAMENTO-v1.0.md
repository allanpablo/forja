# Refinamento de Agentes Orquestrados - Especificação de Melhoras v1.0

Documento vivo com decisões, padrões e implementações para elevar o kit a padrão profissional.

---

## 🎯 1. Qualidade & Segurança

### Status Atual
- Testes: básicos (apenas app.controller.spec.ts na geração NestJS)
- Validação: DTO com `class-validator` disponível, não obrigatório
- Segurança: documentação (security.md) mas sem implementação forçada
- Sanitização: ausente

### Melhoras Tier 1
**[SEC-001] Adicionar validação obrigatória em rotas**
- Toda rota deve usar DTOs com `@IsString()`, `@IsEmail()`, etc
- Tratamento de erro estruturado (HttpException com código específico)
- Template de DTO gerado automaticamente

**[SEC-002] Implementar rate-limiting no gerador**
- Gerar middleware de rate-limiting no backend
- Config: 100 req/min por IP por padrão
- Template pronto em `backend/src/middleware/rate-limit.ts`

**[SEC-003] Sanitização de entrada**
- Remover caracteres perigosos em strings de entrada
- Validar tamanho máximo de payloads (10MB por padrão)
- Usar `helmet` no NestJS

**[SEC-004] Testes obrigatórios**
- Gerar `*.spec.ts` para todo controller novo
- Coverage mínimo: 80% em rotas críticas
- Incluir testes de segurança (SQL injection, XSS simulation)

### Decisões
- ✅ **Usar class-validator + class-transformer**: padrão NestJS, suporta nestação
- ✅ **Helmet para headers de segurança**: reduz vetores de ataque
- ✅ **Coverage mínimo 80%**: viável em projetos novos

---

## 🧠 2. Design de Agentes

### Status Atual
- Agentes: 7 tipos (orchestrator, backend-nest, frontend, dba, security, reviewer, sem specialistas adicionais)
- Prompts: 3 templates genéricos, muito curtos
- Comunicação: contrato explícito no AGENTS.md mas pouco estruturado
- Especialização: baixa (agentes genéricos)

### Melhoras Tier 1
**[AGENT-001] Criar especificação estruturada de agentes**
```
Cada agente terá:
- ID único (ex: agent-backend-nest-v1)
- Missão clara (1-2 frases)
- Entrada esperada (formato, tamanho, estrutura)
- Saída esperada (formato, qualidade, critério de aceite)
- Contexto prioritário (quais docs ler)
- Proibições explícitas (o que NÃO fazer)
- Escala: 1-10 (complexidade, especificidade)
```

**[AGENT-002] Melhorar prompts com estrutura de contexto**
- Adicionar seção: "Você é especialista em [domínio]"
- Incluir exemplos de input/output (few-shot)
- Definir tom (formal, técnico, direto)
- Incluir checklist de validação final

**[AGENT-003] Protocolo de handoff estruturado**
- Formato obrigatório com 7 campos (contexto, mudanças, riscos, pendências, próximo passo, checklist, metadados)
- Validação de handoff antes de aceitar (revisor detecta gaps)
- Template em `memory/50-orchestration/handoff-template.md`

**[AGENT-004] Roteamento inteligente de tarefas**
- Matriz de compatibilidade: tarefa -> agentes capazes
- Score de "fit" (expertise match, carga atual, contexto carregado)
- Orquestrador escolhe melhor agente automaticamente

**[AGENT-005] Contrato de agentes em JSON Schema**
- Definir input/output como JSON Schema
- Validar payloads antes de enviar para agente
- Permitir "strict" mode (erro se saída não match)

### Decisões
- ✅ **JSON Schema para contratos**: interoperável, validável
- ✅ **7 campos obrigatórios no handoff**: reduz gaps e retrabalho
- ✅ **Few-shot em prompts**: aumenta qualidade de resposta 30-50%

---

## 🤖 3. Otimização para IAs (Copilot/Gemini/Codex/Claude)

### Status Atual
- Contexto: compactação básica (build-context-pack.mjs)
- Prompts: genéricos, sem otimização para modelos específicos
- Rastreamento: não há detecção de qual modelo está usando
- Estrutura: Markdown, sem hints de estrutura semântica

### Melhoras Tier 1
**[AI-OPT-001] Context packing com model-aware**
- Detectar modelo via header HTTP ou variável env
- Ajustar tamanho do context-pack conforme modelo (Claude: 100k, GPT-4: 8k, Gemini: 32k)
- Priorizar docs conforme modelo (IA legal: segurança; IA dev: código)

**[AI-OPT-002] Estrutura de prompt "Instruction Bundle"**
```markdown
# [ID] Tarefa
## 👤 Contexto
- Você é: [especialista]
- Objetivo: [claro]

## 📥 Entrada
- Formato: [structure]
- Restrições: [limits]

## 📤 Saída esperada
- Formato: [structure]
- Validação: [checklist]

## 🚫 Proibições
- NUNCA fazer: [list]

## ✅ Checklist Final
- [ ] Step 1
- [ ] Step 2
```

**[AI-OPT-003] Integração com .context/model-config.yml**
```yaml
models:
  claude:
    max_tokens: 100000
    priority_sections: [global, architecture]
    prompt_style: structured
  gpt-4:
    max_tokens: 8000
    priority_sections: [current-task]
    prompt_style: concise
  gemini:
    max_tokens: 32000
    priority_sections: [global, domain]
    prompt_style: narrative
```

**[AI-OPT-004] Memory compression com inline links**
- Em vez de copiar conteúdo inteiro, usar referências: `[[ref:memory/10-product/vision.md:l1-20]]`
- IAs entendem contexto com links
- Reduz tamanho do prompt 60-70%

**[AI-OPT-005] Strict mode para output**
- Definir JSON Schema obrigatório
- IA deve validar contra schema antes de responder
- Se não match: recusar e explicar por quê

### Decisões
- ✅ **JSON Schema para contratos**: validável por qualquer IA
- ✅ **Model-aware context packing**: otimiza para cada modelo
- ✅ **Instruction Bundle format**: estrutura clara, reduz alucinação
- ⚠️ **Inline links**: depende de suporte do modelo (Claude sim, GPT-4 parcial)

---

## 📋 4. ADR & Sistema de Decisões Inteligentes

### Status Atual
- Template: basic (ADR-0001-template.md)
- Rastreamento: banco tem tabela `adrs` mas vazia
- Sem validação de qualidade
- Sem rastreamento de impacto

### Melhoras Tier 1
**[ADR-001] Estrutura robusta de ADR**
```
# ADR-NNNN: [Título conciso]

## Data
2026-04-21

## Contexto
[Por que estamos decidindo isso agora?]
[Constraints técnicas e de negócio]
[Quem precisa saber]

## Questão
[Qual exatamente é a decisão?]

## Opções Consideradas
### Opção A: [Nome]
- ✅ Pros
- ❌ Cons
- 💰 Custo
- ⏱️ Tempo

### Opção B: [Nome]
...

## Decisão
[Qual escolhemos e por quê]

## Impacto Esperado
- Arquitetura: [mudanças]
- Equipe: [skill necessária]
- Cronograma: [efeito]
- Risco: [novo risco]

## Status
- `accepted` / `deprecated` / `superseded` / `proposed`

## Rastreamento
- Issue: #123
- Commit: abc1234
- PR: #456
```

**[ADR-002] Sistema de versionamento e impacto**
- Cada ADR recebe ID único (ADR-0001, ADR-0002, etc)
- Versão no nome (ADR-0001-v1.md, ADR-0001-v2-superseded.md)
- Tabela de impacto: qual código/documentação mudou

**[ADR-003] Decisões registradas no banco**
- Sync automático: script lê ADR-*.md e popula tabela `decisions`
- Query: listar decisões por data, status, impacto
- Relatório: "Decisões críticas dos últimos 30 dias"

**[ADR-004] Integração com handoff**
- Handoff deve referenciar ADRs impactadas: "Veja ADR-0003 para context"
- ADRs devem listar handoffs relacionados
- Bidirecional

### Decisões
- ✅ **ADR com status lifecycle**: rastreabilidade
- ✅ **Impacto explícito**: facilita revisão de risco
- ✅ **Versioning**: permite evolução sem perder histórico

---

## 📚 5. Gestão de Memória (Compactação & Handoff)

### Status Atual
- Compactação: build-context-pack.mjs concatena 6 arquivos prioritários
- Handoff: template básico, sem estrutura de validação
- Recovery: `memory-db-query.mjs` faz busca genérica
- Sem análise de "size creep"

### Melhoras Tier 1
**[MEM-001] Compactação inteligente em 3 níveis**
```
Level 1 (Minimal): 500 tokens
- mission.md + standards.md + current-sprint.md

Level 2 (Standard): 2000 tokens
- L1 + 20-architecture + 70-summaries/global

Level 3 (Full): 8000+ tokens
- L2 + domain/* + handoffs/

Seleção automática: usuário escolhe nível ou sistema elige conforme modelo.
```

**[MEM-002] Compactação com preservação de estrutura**
- Adicionar metadata JSON: `{ "sections": [...], "tokens": 1234, "checksum": "abc123" }`
- Permitir "diff" entre versões de context-pack
- Detectar mudanças significativas (novo capítulo, alteração crítica)

**[MEM-003] Handoff com contexto mínimo garantido**
- Template obrigatório: 7 campos
- Validação: deve incluir "próximo passo" explícito
- Sistema recusa handoff incompleto

**[MEM-004] Recovery inteligente**
- Se agente volta do contexto incompleto, script sugere contexto adicional
- Cache local: docs carregadas recentemente reutilizadas
- Rastreamento: "Último contexto carregado: 2h atrás, 4 mudanças pendentes"

**[MEM-005] Análise de "tamanho creep"**
- Script mensal: "memory size analysis"
- Alerta se memory > 20MB (sinal de documentação não compactada)
- Recomendação: arquivar e.g. handoffs antigos (> 3 meses)

### Decisões
- ✅ **3 níveis de compactação**: flexível para diferentes contextos
- ✅ **7 campos obrigatórios no handoff**: qualidade mínima
- ✅ **Metadata com checksum**: detecta mudanças

---

## 📖 6. Documentação de Produto (Padrão Profissional)

### Status Atual
- Documentação: 478 linhas em docs/, aleatória
- Sem padrão de qualidade
- Sem "getting started" estruturado
- Sem diagrama/visual

### Melhoras Tier 1
**[DOC-001] Estrutura de documentação tipo Stripe/Vercel**
```
📚 Documentação Root
├─ 📄 Getting Started (5 min)
│  ├─ O que é
│  ├─ Instalação 3 linhas
│  ├─ "Hello World"
│  └─ Próximos passos
├─ 🏗️ Conceitos Fundamentais
│  ├─ Memória Hierárquica
│  ├─ Agentes e Roles
│  ├─ Orquestração
│  └─ Handoff & Continuidade
├─ 🔧 Guia de Uso
│  ├─ Criar Novo Projeto
│  ├─ Adicionar Domínio
│  ├─ Configurar Agentes
│  └─ Usar Scripts
├─ 🎓 Tutoriais
│  ├─ [Caso 1] Projeto com 1 backend + 1 worker
│  ├─ [Caso 2] Projeto com múltiplos domínios
│  └─ [Caso 3] Integração com seu CLI favorito
├─ 🔍 Referência API
│  ├─ CLI flags
│  ├─ Memory structure
│  └─ Database schema
├─ ⚙️ Configuração Avançada
│  ├─ Custom agents
│  ├─ Model-specific tuning
│  └─ Security hardening
└─ ❓ FAQ & Troubleshooting
```

**[DOC-002] Padrão de escrita**
- Cada arquivo: < 500 linhas
- Títulos H1-H3 apenas
- Code samples: 5-10 linhas máximo, contexto claro
- Links internos: `[topic](../path/to/doc.md)`
- "Próximo passo" em todo artigo

**[DOC-003] Diagramas em ASCII + Mermaid**
- Arquitetura: diagram ASCII em README
- Fluxo de agentes: Mermaid graph
- Memory hierarchy: tree ASCII

**[DOC-004] Changelog estruturado**
- Arquivo: `docs/CHANGELOG.md`
- Versão: major.minor.patch
- Seções: Added, Changed, Deprecated, Removed, Fixed, Security
- Link para ADRs relacionadas

**[DOC-005] Contributing Guide**
- Padrão de branches: `feat/`, `fix/`, `docs/`
- Commit message: `[type] Description`
- PR template: checklist + referência a ADR
- Teste: instruções passo a passo

### Decisões
- ✅ **Estrutura em camadas**: escalável
- ✅ **Padrão Stripe/Vercel**: familiar, profissional
- ✅ **Diagrama + texto**: clareza

---

## ⚙️ 7. Metodologia Ágil (Sprint & Entregáveis)

### Status Atual
- Template de sprint: `current-sprint.md` básico
- Sem estrutura de planning, retrospectiva
- Sem definição de "pronto"
- Sem métricas de velocidade

### Melhoras Tier 1
**[AGILE-001] Estrutura de sprint**
```
# Sprint NN (Data início - Data fim)

## Objetivo (1-2 frases)
[O que queremos conseguir]

## Capacidade
- Devs: 2 pessoas × 5 dias × 6h = 60 horas
- QA: 1 pessoa × 5 dias × 4h = 20 horas
- Total: 80 horas

## User Stories
### [ID] Título
- Como [ator]
- Quero [ação]
- Para [benefício]
- AC1: [critério]
- AC2: [critério]
- Estimativa: [horas]
- Dono: [person]
- Status: `todo` / `in-progress` / `review` / `done`

## Riscos Sprint
| Risco | Impacto | Mitigation |
|-------|---------|-----------|
| ...   | ...     | ...       |

## Métricas
- Velocity: NN story points
- Burn down: conforme esperado
- Bugs encontrados: NN
```

**[AGILE-002] Definição de "Pronto" (Definition of Done)**
```
- Código implementado
- Testes escritos (cobertura > 80%)
- Code review + approval
- Documentação atualizada
- ADR criado (se mudança estrutural)
- Handoff registrado (se cross-agent)
- Passou em CI/CD
- Deploy para staging
```

**[AGILE-003] Estrutura de ceremônias**
- Planning (2h): decomposição de stories
- Standup diário (15min): sync
- Review (1h): demo + feedback
- Retro (1h): o que foi bem, o que melhorar, ações

**[AGILE-004] Matriz de rastreamento**
- Integrar com `improvement_items` no BD
- Query: status de todas as melhoras
- Dashboard: % completo por categoria

**[AGILE-005] Release notes profissional**
- Template: v0.2.0 (YYYY-MM-DD)
- Seções: Features, Improvements, Fixes, Breaking Changes
- Incluir: migration guide (se necessário)

### Decisões
- ✅ **User stories com AC**: clareza de aceite
- ✅ **Definition of Done explícito**: qualidade
- ✅ **Rastreamento em BD**: visibilidade

---

## 📊 8. Observabilidade (Logs, Métricas, Tracing)

### Status Atual
- Logs: genéricos, sem estrutura
- Métricas: ausentes
- Tracing: não existe
- Observabilidade de agentes: 0

### Melhoras Tier 1
**[OBS-001] Logs estruturados com contexto**
```json
{
  "timestamp": "2026-04-21T09:51:33.423Z",
  "level": "info",
  "agent": "orchestrator",
  "task_id": "task-123",
  "action": "task_decomposed",
  "owner_count": 3,
  "duration_ms": 245,
  "context": {
    "file_count": 12,
    "size_bytes": 45000
  }
}
```

**[OBS-002] Decorator para log estruturado em NestJS**
```typescript
@LogStructured('backend-nest', 'implement_endpoint')
async createUser(dto: CreateUserDto) {
  // Log automático com agent, ação, duração, resultado
}
```

**[OBS-003] Métricas de agentes**
- `agent_task_count`: quantas tarefas por agente
- `agent_success_rate`: % de sucesso (com base em handoff quality)
- `agent_context_size`: tamanho médio de contexto carregado
- `handoff_quality_score`: 1-10 baseado em preenchimento

**[OBS-004] Tracing de handoff**
- Cada handoff recebe ID único: `handoff-uuid-timestamp`
- Trace: orchestrator -> worker-a -> reviewer -> worker-b
- Latência entre handoffs: rastreada
- Alertas: handoff aberto > 1h

**[OBS-005] Dashboard de observabilidade**
- Script: `backend/scripts/memory-db-observability.mjs`
- Queries pré-prontas:
  - "Handoffs abertos"
  - "Agente com menor taxa de sucesso"
  - "Documentação > 20MB"
  - "ADRs sem impacto vinculado"

### Decisões
- ✅ **Logs estruturados em JSON**: parseável
- ✅ **Decorator para automação**: menos boilerplate
- ✅ **Métricas por agente**: visibilidade

---

## 📈 Roadmap de Implementação

### Fase 1 (Semanas 1-2): Tier 1 Foundation
- [ ] SEC-001, SEC-002: Validação + Rate-limiting
- [ ] AGENT-001, AGENT-002: Prompts estruturados
- [ ] AI-OPT-001: Context packing model-aware
- [ ] ADR-001: Estrutura robusta
- [ ] MEM-001: 3 níveis de compactação
- [ ] DOC-001: Estrutura de documentação
- [ ] AGILE-001, AGILE-002: Sprint template + DoD
- [ ] OBS-001: Logs estruturados

### Fase 2 (Semanas 3-4): Tier 1 Completion
- [ ] SEC-003, SEC-004: Sanitização + Testes
- [ ] AGENT-003, AGENT-004, AGENT-005: Handoff, roteamento, schema
- [ ] AI-OPT-002 até AI-OPT-005: Advanced AI optimization
- [ ] ADR-002, ADR-003, ADR-004: Versionamento + BD + integração
- [ ] MEM-002 até MEM-005: Compactação inteligente + recovery
- [ ] DOC-002 até DOC-005: Padrão + diagramas + changelog
- [ ] AGILE-003, AGILE-004, AGILE-005: Ceremônias + matriz + release notes
- [ ] OBS-002 até OBS-005: Decorator + métricas + tracing + dashboard

### Fase 3 (Semanas 5-6): Tier 2 + Integração
- Documentação de Produto (completa)
- Metodologia Ágil (full ceremonies)
- Observabilidade (full stack)

---

## 💾 Rastreamento em Banco de Dados

Todos os items estão registrados na tabela `improvement_items`:

```sql
SELECT * FROM improvement_items 
WHERE status != 'done' 
ORDER BY area_id, complexity;

-- Atualizar status conforme progresso
UPDATE improvement_items SET status = 'in_progress' 
WHERE id = 'SEC-001';
```

Decisões vinculadas em `decisions`:

```sql
SELECT d.* FROM decisions d
JOIN improvement_items i ON d.item_id = i.id
WHERE i.area_id = 'ai-optimization'
ORDER BY d.created_at DESC;
```

---

## ✨ Próximos Passos

1. **Review este documento** com stakeholders
2. **Ajustar prioridades** se necessário
3. **Começar Fase 1** na próxima sprint
4. **Atualizar BD** conforme progresso
5. **Documentar decisões** em ADRs quando relevante

---

**Versão**: 1.0 | **Data**: 2026-04-21 | **Autor**: Copilot Analysis | **Status**: Aceito para Implementação

