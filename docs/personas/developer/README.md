# 💻 Guia para Developers

Você codifica. Quer exemplos, atalhos, padrões.

---

## ⏱️ Leia em 15 minutos

### O que é isso?

**create-memory-nest-kit** gera projetos prontos com:

- **Backend NestJS** — Já com módulos, DTOs, testes
- **Memory em Markdown** — Contexto organizado
- **Agentes** — Você + 2-3 IAs trabalhando em paralelo

### Primeiro comando

```bash
npm run workspace:init
npm run project:new meu-projeto
cd ~/forja-workspace/projects/meu-projeto
cat START-HERE.md
```

---

## 🚀 5 Minutos: Começar a Codificar

### 1. Gerar projeto (1 min)

```bash
npm run project:new meu-projeto
cd ~/forja-workspace/projects/meu-projeto
```

### 2. Instalar dependências (5 min)

```bash
cd backend
npm install
```

### 3. Rodar em dev (2 min)

```bash
npm run start:dev
# Abra: http://localhost:3000/api/health
```

### 4. Ver dashboard de agentes (1 min)

```bash
# Em outra aba
curl http://localhost:3000/ops
# Abra em navegador: http://localhost:3000/ops
```

**Pronto!** Você está up & running.

---

## 📂 Estrutura Rápida

```
meu-projeto/
├─ backend/              ← Sua API
│  ├─ src/
│  │  ├─ modules/ops/   ← Exemplo: operações
│  │  ├─ app.module.ts  ← Registre seus módulos aqui
│  │  └─ main.ts        ← Entry point
│  ├─ test/
│  ├─ package.json
│  └─ tsconfig.json
├─ memory/               ← Documentação estruturada
│  ├─ 00-global/        ← Mission, standards
│  ├─ 10-product/       ← O que você tá construindo
│  ├─ 20-architecture/  ← Design
│  ├─ 30-domains/       ← Seus bounded contexts
│  └─ 50-orchestration/ ← Handoffs (IAs)
├─ agents/              ← Descrição dos papéis
├─ skills/              ← Capacidades de agentes
├─ prompts/             ← Instruções por contexto
└─ DOC-MAP.md          ← Navegação de docs
```

---

## 💡 Padrões de Código

### Padrão 1: Novo Módulo NestJS

```bash
# Criar módulo
nest g module features/auth
nest g controller features/auth
nest g service features/auth

# Estrutura gerada:
# src/features/auth/
# ├─ auth.module.ts
# ├─ auth.controller.ts
# ├─ auth.service.ts
# ├─ auth.controller.spec.ts
# └─ dto/
#    ├─ create-auth.dto.ts
#    └─ login.dto.ts
```

### Padrão 2: DTO com Validação

```typescript
// src/features/auth/dto/login.dto.ts
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}
```

### Padrão 3: Service + Controller

```typescript
// src/features/auth/auth.service.ts
@Injectable()
export class AuthService {
  login(dto: LoginDto) {
    // Sua lógica
    return { token: '...' };
  }
}

// src/features/auth/auth.controller.ts
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
```

### Padrão 4: Testes

```typescript
// src/features/auth/auth.service.spec.ts
describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService();
  });

  it('login deve retornar token', () => {
    const result = service.login({ email: 'a@b.com', password: '123456' });
    expect(result.token).toBeDefined();
  });
});
```

---

## 🛠️ Comandos Essenciais

| Comando | O quê |
|---------|-------|
| `npm run start:dev` | Rodar em dev com hot-reload |
| `npm run build` | Build para prod |
| `npm test` | Rodar testes |
| `npm run test:cov` | Coverage report |
| `npm run lint` | ESLint |
| `npm run format` | Prettier auto-fix |

---

## 📝 Memória para Agentes

### Como registrar uma feature

```bash
# Criar arquivo de contexto
cat > memory/30-domains/seu-dominio/api.md << EOF
# API de Seu Domínio

## POST /api/seu-endpoint

Request:
\`\`\`json
{ "campo": "valor" }
\`\`\`

Response:
\`\`\`json
{ "id": 123, "campo": "valor" }
\`\`\`

Error cases:
- 400: Validação falhou
- 401: Não autenticado
EOF
```

### Como pedir ajuda a uma IA

1. **Copie seu contexto**
   ```bash
   node scripts/build-context-pack.mjs
   cat .context/context-pack.md
   ```

2. **Cole num painel de IA**
   - Claude: cole em nova conversation
   - ChatGPT: mesma aba
   - Copilot: abra arquivo + Ctrl+K

3. **Peça a feature**
   ```
   Implementar POST /api/seu-endpoint com validação JWT
   ```

4. **IA trabalha com contexto = menos erros**

---

## 🤝 Handoff Protocol

Quando terminar uma feature:

```bash
# Criar handoff para o revisor
node ../scripts/append-handoff.mjs seu-nome revisor "Implementei auth"

# Abrir arquivo gerado e preencher:
cat memory/50-orchestration/handoffs/[ARQUIVO].md
```

Template:
```markdown
# Handoff: seu-nome -> revisor

## Contexto
Implementei JWT auth com validação

## Alterações
- src/features/auth/auth.module.ts (novo)
- src/features/auth/auth.service.ts (novo)
- src/features/auth/auth.controller.ts (novo)

## Riscos
- JWT secret está em .env (não em código) ✅
- Falta refresh token (pendência)

## Pendências
- E2E test para logout

## Próximo passo
Revisor valida segurança e testes
```

---

## 🧪 Testes Rápidos

### 1. Teste unitário (um serviço)

```bash
npm test -- auth.service.spec.ts
```

### 2. Teste E2E (API completa)

```bash
npm run test:e2e -- auth.e2e-spec.ts
```

### 3. Coverage

```bash
npm run test:cov
# Gera coverage/index.html
open coverage/index.html
```

---

## 🔗 Recursos

| Recurso | Quando usar |
|---------|------------|
| [boilerplates/](../../../boilerplates/README.md) | Padrões prontos por stack |
| [quick-reference.md](../../quick-reference.md) | Atalhos de comandos |
| [fluxo.md](../../fluxo.md) | Roteiro do ciclo CLI-first |
| [NestJS Docs](https://docs.nestjs.com) | Dúvidas NestJS |

---

## 🎯 Fluxo Recomendado (Primeira Feature)

```
1. Ler este guia (15 min)
   ↓
2. Rodar o generator (5 min)
   ↓
3. npm install + npm run start:dev (10 min)
   ↓
4. Criar novo módulo
   nest g resource features/seu-dominio
   ↓
5. Preencher DTO com validação
   ✏️ Copie o padrão de login.dto.ts
   ↓
6. Implementar lógica no service
   ✏️ Copie padrão do auth.service.ts
   ↓
7. Testar
   npm test
   ↓
8. Registrar handoff (para revisor validar)
   node ../scripts/append-handoff.mjs
   ↓
9. Deploy! 🚀
```

---

## 🚨 Armadilhas Comuns

| Erro | Solução |
|------|---------|
| "Class X undefined" | Registrar em module.ts |
| "DTO não valida" | Adicionar decoradores @IsEmail etc |
| "Teste falha" | Mockar dependências |
| "Port 3000 ocupada" | PORT=3001 npm run start:dev |

---

## 📋 Checklist Primeira Feature

- [ ] Generator rodou ✅
- [ ] Backend instalou ✅
- [ ] Health check funciona ✅
- [ ] Criei novo módulo ✅
- [ ] DTO com validação ✅
- [ ] Service + Controller ✅
- [ ] Testes passam ✅
- [ ] Handoff criado ✅
- [ ] Revisor aprovou ✅

**Tempo total:** ~3 horas (primeira feature)

---

## 🚀 Próximas Features

Depois da primeira:
1. Velocidade aumenta ~2-3x (padrão já conhecido)
2. Copie + ajuste de feature anterior
3. Use IAs em paralelo (agents) para ir mais rápido

---

**Tempo total onboarding:** ~1h até primeira feature

💪 Pronto? Comece agora!
