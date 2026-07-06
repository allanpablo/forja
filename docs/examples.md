# 💻 Exemplos de Código - Quick Reference

Snippets prontos para copiar/colar na implementação de Fase 1.

---

## 🔒 SEC-001: Validação em DTOs

### Arquivo: `backend/src/common/dto/create-user.dto.ts`

```typescript
import { IsString, IsEmail, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class CreateUserDto {
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  @IsString()
  @MinLength(3, { message: 'Nome deve ter no mínimo 3 caracteres' })
  @MaxLength(100)
  name: string;

  @IsNotEmpty()
  @IsEmail({}, { message: 'Email inválido' })
  email: string;

  @IsNotEmpty()
  @MinLength(8, { message: 'Senha deve ter no mínimo 8 caracteres' })
  @MaxLength(255)
  password: string;
}
```

### Arquivo: `backend/src/app.controller.ts`

```typescript
import { Controller, Get, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { CreateUserDto } from './common/dto/create-user.dto';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  health(): { status: string } {
    return this.appService.health();
  }

  @Post('users')
  createUser(@Body() dto: CreateUserDto) {
    try {
      return { 
        id: 'user-' + Date.now(), 
        ...dto,
        createdAt: new Date().toISOString()
      };
    } catch (error) {
      throw new HttpException(
        'Erro ao criar usuário',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
```

### Teste (com cURL)

```bash
# ✅ Sucesso
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "João Silva",
    "email": "joao@example.com",
    "password": "senha123456"
  }'

# ❌ Erro: Email inválido
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "João",
    "email": "invalid-email",
    "password": "senha123456"
  }'
# Resposta: 400 Bad Request
```

---

## 🚦 SEC-002: Rate-Limiting Middleware

### Arquivo: `backend/src/middleware/rate-limit.middleware.ts`

```typescript
import { Injectable, NestMiddleware, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private store = new Map<string, RateLimitRecord>();
  private readonly MAX_REQUESTS = 100;
  private readonly WINDOW_MS = 60 * 1000; // 1 minuto

  use(req: Request, res: Response, next: NextFunction) {
    const ip = this.getClientIp(req);
    const now = Date.now();

    if (!this.store.has(ip)) {
      this.store.set(ip, { count: 1, resetAt: now + this.WINDOW_MS });
      return next();
    }

    const record = this.store.get(ip)!;

    // Reset window se expirou
    if (now > record.resetAt) {
      this.store.set(ip, { count: 1, resetAt: now + this.WINDOW_MS });
      return next();
    }

    // Excedeu limite
    if (record.count >= this.MAX_REQUESTS) {
      throw new HttpException(
        `Rate limit exceeded. Max ${this.MAX_REQUESTS} requests per minute.`,
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    record.count++;
    res.setHeader('X-RateLimit-Remaining', this.MAX_REQUESTS - record.count);
    next();
  }

  private getClientIp(req: Request): string {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.socket.remoteAddress ||
      'unknown'
    );
  }
}
```

### Arquivo: `backend/src/app.module.ts`

```typescript
import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RateLimitMiddleware } from './middleware/rate-limit.middleware';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RateLimitMiddleware)
      .forRoutes('*'); // Aplicar a todas as rotas
  }
}
```

---

## 📝 OBS-001: Logs Estruturados em JSON

### Arquivo: `backend/src/common/decorators/log.decorator.ts`

```typescript
import { SetMetadata } from '@nestjs/common';

export interface LogMetadata {
  agent: string;
  action: string;
}

export const LogStructured = (agent: string, action: string) =>
  SetMetadata('log', { agent, action });
```

### Arquivo: `backend/src/common/interceptors/logging.interceptor.ts`

```typescript
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';

interface StructuredLog {
  timestamp: string;
  level: string;
  agent: string;
  action: string;
  duration_ms: number;
  success: boolean;
  error?: string;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const handler = context.getHandler();
    const logMetadata = this.reflector.get<any>('log', handler);

    const startTime = Date.now();

    return next.handle().pipe(
      tap(
        (data) => this.logStructured(logMetadata, startTime, true, null),
        (error) => this.logStructured(logMetadata, startTime, false, error)
      )
    );
  }

  private logStructured(
    metadata: any,
    startTime: number,
    success: boolean,
    error: any
  ) {
    const duration = Date.now() - startTime;

    const log: StructuredLog = {
      timestamp: new Date().toISOString(),
      level: success ? 'info' : 'error',
      agent: metadata?.agent || 'unknown',
      action: metadata?.action || 'unknown',
      duration_ms: duration,
      success,
    };

    if (error) {
      log.error = error.message;
    }

    console.log(JSON.stringify(log));
  }
}
```

### Uso em Controller

```typescript
import { Controller, Post, Body } from '@nestjs/common';
import { LogStructured } from './common/decorators/log.decorator';
import { CreateUserDto } from './common/dto/create-user.dto';

@Controller('users')
export class UserController {
  @Post()
  @LogStructured('backend-nest', 'create_user')
  create(@Body() dto: CreateUserDto) {
    return { id: 'user-1', ...dto };
  }
}
```

### Saída de Log

```json
{
  "timestamp": "2026-04-21T09:51:33.423Z",
  "level": "info",
  "agent": "backend-nest",
  "action": "create_user",
  "duration_ms": 45,
  "success": true
}
```

---

## 🧠 AGENT-002: Prompt com Few-Shot

### Template: `prompts/worker-create-endpoint.md`

```markdown
# TASK-001: Implementar Endpoint GET /users/:id

## 👤 Contexto (Quem você é)
Você é um especialista em NestJS e arquitetura REST API.
Objetivo: Criar endpoint seguro, validado e com cobertura de teste.
Nível: Senior (decisões arquiteturais esperadas)

## 📥 Entrada
```json
{
  "task_id": "TASK-001",
  "endpoint": "GET /users/:id",
  "repository": "user-repository.ts",
  "dto_out": "GetUserResponseDto",
  "validations": ["id must be UUID", "user must exist"],
  "owner_file": "src/users/"
}
```

Restrições:
- ID deve ser UUID válido
- Usar DTOs para response
- Retornar 404 se usuário não existe
- Sem dados sensíveis (senha, etc)

## 📤 Saída Esperada
```typescript
// Arquivo: src/users/users.controller.ts
@Get(':id')
async getUser(@Param('id', ParseUUIDPipe) id: string) {
  return this.userService.findOne(id);
}

// Arquivo: src/users/dtos/get-user-response.dto.ts
export class GetUserResponseDto {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

// Arquivo: src/users/users.controller.spec.ts
describe('GET /users/:id', () => {
  it('should return user when exists', async () => {
    const result = await controller.getUser(validUUID);
    expect(result.id).toBe(validUUID);
  });

  it('should throw 404 when user not found', async () => {
    await expect(controller.getUser(nonExistentUUID))
      .rejects.toThrow(NotFoundException);
  });
});
```

Validação:
- [ ] Código TypeScript válido
- [ ] DTOs com @IsUUID()
- [ ] 2 testes (sucesso + erro)
- [ ] Sem dados sensíveis na response
- [ ] Documentado (JSDoc)

## 🚫 Proibições (MUITO IMPORTANTE)
- ❌ NUNCA retornar senha ou dados sensíveis
- ❌ NUNCA criar novo roteamento sem passar por app.controller
- ❌ NUNCA ignorar validação de UUID
- ❌ NÃO adicione dependências novas sem ADR

## ✅ Checklist Final
- [ ] Arquivo criado em `src/users/`
- [ ] DTOs implementados e validados
- [ ] Controller tem rota GET
- [ ] Tests estão passando (npm test)
- [ ] Sem build errors (npm run build)
- [ ] Sem lint errors (npm run lint)
- [ ] Documentação atualizada (docstring)
- [ ] Handoff pronto em memory/50-orchestration/handoffs/

---

## 📚 Exemplos

### Exemplo 1: Sucesso
**Input**: GET /users/550e8400-e29b-41d4-a716-446655440000  
**Output**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "João Silva",
  "email": "joao@example.com",
  "createdAt": "2026-04-21T09:51:33.423Z"
}
```

### Exemplo 2: Erro (ID inválido)
**Input**: GET /users/invalid-id  
**Output**: 400 Bad Request - "Validation failed for param id"

### Exemplo 3: Erro (User não existe)
**Input**: GET /users/550e8400-e29b-41d4-a716-999999999999  
**Output**: 404 Not Found - "User not found"
```

---

## 🤖 AI-OPT-001: Model Config YAML

### Arquivo: `.context/model-config.yml`

```yaml
models:
  claude-opus:
    max_tokens: 100000
    priority_sections:
      - memory/00-global/mission.md
      - memory/00-global/standards.md
      - memory/20-architecture/backend.md
      - memory/40-delivery/current-sprint.md
      - memory/70-summaries/global-summary.md
    prompt_style: structured
    context_multiplier: 1.0
    
  gpt-4-turbo:
    max_tokens: 8000
    priority_sections:
      - memory/00-global/mission.md
      - memory/40-delivery/current-sprint.md
    prompt_style: concise
    context_multiplier: 0.3
    
  gemini-pro:
    max_tokens: 32000
    priority_sections:
      - memory/00-global/mission.md
      - memory/20-architecture/backend.md
      - memory/70-summaries/global-summary.md
    prompt_style: narrative
    context_multiplier: 0.7

compression_levels:
  minimal:
    tokens: 500
    includes: [mission.md, standards.md, current-sprint.md]
  standard:
    tokens: 2000
    includes: [level-minimal, 20-architecture/*, summaries/]
  full:
    tokens: 8000
    includes: [all]
```

---

## 💾 MEM-001: 3 Níveis de Compactação

### Script: `scripts/build-context-pack-smart.mjs`

```javascript
import fs from 'node:fs';
import path from 'node:path';

const model = process.argv[2] || 'standard'; // minimal, standard, full

const levels = {
  minimal: {
    maxTokens: 500,
    files: [
      'memory/00-global/mission.md',
      'memory/00-global/standards.md',
      'memory/40-delivery/current-sprint.md'
    ]
  },
  standard: {
    maxTokens: 2000,
    files: [
      ...levels.minimal.files,
      'memory/20-architecture/system-overview.md',
      'memory/20-architecture/backend.md',
      'memory/70-summaries/global-summary.md'
    ]
  },
  full: {
    maxTokens: 8000,
    files: [
      ...levels.standard.files,
      'memory/10-product/vision.md',
      'memory/30-domains/auth/rules.md',
      'memory/30-domains/billing/rules.md'
    ]
  }
};

const config = levels[model];
if (!config) {
  console.error(`Level não reconhecido: ${model}`);
  process.exit(1);
}

let content = `# Context Pack (${model.toUpperCase()})\n\n`;
let tokenCount = 0;

for (const file of config.files) {
  const path = `../../${file}`;
  if (!fs.existsSync(path)) continue;

  const data = fs.readFileSync(path, 'utf-8');
  const tokens = Math.ceil(data.length / 4);

  if (tokenCount + tokens > config.maxTokens) {
    console.log(`⚠️ Limite de tokens (${config.maxTokens}) atingido`);
    break;
  }

  content += `## ${file}\n\n${data}\n\n---\n\n`;
  tokenCount += tokens;
}

content += `\n\n_Pack: ${model} | Tokens: ~${tokenCount} / ${config.maxTokens}_`;

const outDir = '../.context';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(
  path.join(outDir, `context-pack-${model}.md`),
  content
);

console.log(`✅ Context pack criado: ${config.maxTokens} tokens, nível: ${model}`);
```

### Uso

```bash
# Minimal (500 tokens)
node scripts/build-context-pack-smart.mjs minimal

# Standard (2000 tokens)
node scripts/build-context-pack-smart.mjs standard

# Full (8000 tokens)
node scripts/build-context-pack-smart.mjs full
```

---

## ⚙️ Próximos Exemplos

Em breve:
- ADR-001: Template estruturado
- AGENT-001: Especificação JSON Schema
- DOC-001: Índice de documentação
- AGILE-001: Sprint markdown template

---

**Último Update**: 2026-04-21 | **Items Cobertos**: 5 | **Código Pronto**: ✅ 100%

