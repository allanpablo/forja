# 🧪 Guia para QA / Testers

Você valida qualidade. Quer critérios, checklists, automação.

---

## ⏱️ Leia em 10 minutos

### O que você precisa saber

**create-memory-nest-kit** gera projetos com:

- **Testes automáticos** — >80% coverage obrigatório
- **Validação de entrada** — Sem dados inválidos na API
- **Revisão automática** — Revisor-agent bloqueia código ruim

### Seu papel

1. **Validar critérios de aceite** (antes do deploy)
2. **Testar handoffs** (qualidade entre agentes)
3. **Verificar checklist de segurança** (OWASP Top 10)

---

## 🎯 Critérios de Aceite (Obrigatório)

### Para TODA feature:

- [ ] **Código**
  - ✅ Lint passa (ESLint)
  - ✅ Sem TypeScript errors
  - ✅ >80% coverage em rotas críticas
  - ✅ Sem console.log deixado

- [ ] **Testes**
  - ✅ Unit tests passam
  - ✅ E2E tests cobrem happy path + error cases
  - ✅ Sem testes "skip" ou "todo"

- [ ] **Segurança**
  - ✅ DTO com validação (obrigatório)
  - ✅ Sem secrets em logs/erro
  - ✅ Sem SQL injection
  - ✅ Rate limiting habilitado

- [ ] **Documentação**
  - ✅ Handoff preenchido completamente
  - ✅ ADR criado (se decisão)
  - ✅ memory/30-domains/[dominio]/api.md atualizado

- [ ] **Performance**
  - ✅ Endpoint responde <200ms
  - ✅ Sem N+1 queries
  - ✅ Sem memory leaks

---

## 📋 Checklist Pre-Commit

Execute ANTES de aprovar:

```bash
# 1. Lint + Build
npm run lint
npm run build

# 2. Testes
npm test
npm run test:cov  # Verificar coverage > 80%

# 3. E2E
npm run test:e2e

# 4. Segurança básica
grep -r "TODO\|FIXME\|HACK" src/  # Sem deixadas
grep -r "console\." src/  # Sem logs em prod
grep -r "password\|secret\|api_key" src/ --exclude="*.env*"  # Secretos expostos?
```

---

## 🔍 Teste Manual: 5 Passos

### 1. Health Check

```bash
curl http://localhost:3000/api/health
# Esperado: { "status": "ok" }
```

### 2. Seu Endpoint

```bash
curl -X POST http://localhost:3000/api/seu-endpoint \
  -H "Content-Type: application/json" \
  -d '{"campo":"valor"}'
# Esperado: 200 OK ou erro específico
```

### 3. Validação (enviando lixo)

```bash
# Teste com email inválido
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"nao-e-email","password":"123"}'
# Esperado: 400 Bad Request (DTO rejection)
```

### 4. Autenticação

```bash
# Sem token
curl http://localhost:3000/api/protegido
# Esperado: 401 Unauthorized

# Com token válido
curl -H "Authorization: Bearer TOKEN" http://localhost:3000/api/protegido
# Esperado: 200 OK (se implementado)
```

### 5. Rate Limiting

```bash
# Enviar 150 requests em 1 min
for i in {1..150}; do curl http://localhost:3000/api/health; done
# Esperado: Após 100, retorna 429 Too Many Requests
```

---

## 🧪 Teste de Handoff

Quando agent A passa para agent B:

**Validar:**
- [ ] Contexto está claro (não precisa adivinhar)
- [ ] Alterações listadas = arquivos reais modificados
- [ ] Riscos são verdadeiros (não alarmes)
- [ ] Pendências têm dono (quem faz?)
- [ ] Próximo passo é executável (não vago)

**Exemplo BOM:**
```markdown
# Handoff: Backend → Reviewer

## Contexto
Implementei GET /api/users/{id} com JWT validation

## Alterações
- src/features/users/users.controller.ts
- src/features/users/users.service.ts
- src/features/users/dto/get-user.dto.ts

## Riscos
- 404 para user não encontrado (testado)
- JWT secret em .env apenas (seguro)

## Pendências
- Nenhuma

## Próximo passo
Revisor: Validar testes, fazer E2E
```

**Exemplo RUIM:**
```markdown
# Handoff: Backend → Reviewer

## Contexto
Implementei coisas

## Alterações
- Vários arquivos

## Riscos
- Talvez segurança?

## Pendências
- Talvez testes?

## Próximo passo
Aprova?
```

---

## 🔐 Checklist de Segurança (OWASP Top 10)

Para CADA endpoint novo:

- [ ] **A01:2021 – Broken Access Control**
  - [ ] JWT/Auth obrigatório em rotas protegidas?
  - [ ] Sem hardcoded roles/permissions?

- [ ] **A02:2021 – Cryptographic Failures**
  - [ ] Senhas hasheadas? (bcrypt)
  - [ ] Secrets em .env (não em código)?
  - [ ] HTTPS only em prod?

- [ ] **A03:2021 – Injection**
  - [ ] DTO com validação bloqueia SQL injection?
  - [ ] Sem concatenação de queries?

- [ ] **A04:2021 – Insecure Design**
  - [ ] Rate limiting ativado?
  - [ ] CORS restritivo?

- [ ] **A05:2021 – Security Misconfiguration**
  - [ ] Sem console.log de dados sensíveis?
  - [ ] Helmet headers presente?

- [ ] **A06:2021 – Vulnerable Components**
  - [ ] npm audit limpo? (npm audit)
  - [ ] Dependências atualizadas?

---

## 📊 Teste Coverage

### Alvo: >80% em código crítico

```bash
npm run test:cov
# Abre coverage/index.html

# Verificar:
# - Statements > 80%
# - Branches > 75%
# - Functions > 80%
# - Lines > 80%
```

---

## 🚀 Teste E2E Rápido

```typescript
// test/features.e2e-spec.ts
describe('Features (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('POST /api/seu-endpoint com dados válidos', () => {
    return request(app.getHttpServer())
      .post('/api/seu-endpoint')
      .send({ campo: 'valor' })
      .expect(201)
      .expect((res) => {
        expect(res.body.id).toBeDefined();
      });
  });

  it('POST /api/seu-endpoint com dados inválidos', () => {
    return request(app.getHttpServer())
      .post('/api/seu-endpoint')
      .send({ campo: '' })  // Inválido
      .expect(400);  // Bad Request
  });
});
```

Rodar:
```bash
npm run test:e2e
```

---

## 🎯 Fluxo de Validação

```
1. Developer cria feature
   ↓
2. Cria handoff em memory/50-orchestration/handoffs/
   ↓
3. Você valida handoff (checklist acima)
   ↓ Se ruim → Rejeita, Developer corrige
   ↓ Se bom → Aprova
   ↓
4. Você roda testes + validação
   npm test && npm run test:cov
   ↓ Se falha → Rejeita
   ↓ Se passa → Aprova
   ↓
5. Você faz teste manual dos 5 passos
   ↓ Se quebra → Rejeita
   ↓ Se tudo bem → Aprova
   ↓
6. Deploy! 🚀
```

---

## 🐛 Bug Reporting

Quando encontrar bug:

```markdown
# Bug: Endpoint X retorna 500

## Reprodução
POST /api/seu-endpoint com payload { "campo": "valor especial" }

## Esperado
200 OK com response válido

## Atual
500 Internal Server Error

## Logs
[Cole stack trace aqui]

## Severidade
🔴 Critical (quebra feature)
```

---

## 📋 Checklist de Onboarding (QA)

- [ ] Li este guia (10 min)
- [ ] Rodei o generator (5 min)
- [ ] Executei os 5 testes manuais (5 min)
- [ ] Verifiquei coverage (5 min)
- [ ] Aprovei primeiro handoff ✅
- [ ] Pronto!

---

## 📞 Recursos

| Recurso | Quando usar |
|---------|------------|
| [CHECKLIST-FINAL.md](../../CHECKLIST-FINAL.md) | Critérios globais |
| [DASHBOARD-PROGRESSO.md](../../DASHBOARD-PROGRESSO.md) | Status do projeto |
| [REFINAMENTO-v1.0.md](../../REFINAMENTO-v1.0.md) | Segurança (SEC-*) |

---

**Tempo total:** ~30 min por feature até habituado

✅ Você é o guardião da qualidade!
