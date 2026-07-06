# 🚀 Guia de Implementação Prático - Fase 1

Documento com instruções passo a passo para implementar as melhoras Tier 1 nos agentes.

---

## Início Rápido: Diagnosticar o Estado Atual

```bash
cd /home/apk/Documentos/GitHub/2-Projeto-Agents

# Verificar estado dos agentes
ls -lh exemplo-v3/agents/
ls -lh exemplo-v3/skills/
ls -lh exemplo-v3/prompts/

# Consultar plano de melhoras no BD
# (requer SQL access)
SELECT * FROM improvement_items 
WHERE status = 'pending' 
ORDER BY complexity, area_id;

# Gerar projeto de teste
node bin/create-memory-nest-kit.js /tmp/test-project
cd /tmp/test-project

# Verificar estrutura gerada
ls -la
tree memory/ | head -30
```

---

## 🎯 Semana 1: Implementar SEC-001 & SEC-002

### SEC-001: Validação Obrigatória em Rotas

**O que fazer:**
1. Criar DTO com validadores no template backend
2. Gerar exemplo em `backend/src/users/create-user.dto.ts`
3. Usar em controller

**Alteração em `bin/create-memory-nest-kit.js` (writeNestApi)**

```javascript
// Adicionar novo arquivo ao objeto 'files':
'backend/src/common/dto/create-user.dto.ts': `import { IsString, IsEmail, IsNotEmpty, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsNotEmpty()
  @MinLength(8)
  password: string;
}
`,

// Atualizar app.controller.ts com validação
'backend/src/app.controller.ts': `import { Controller, Get, Post, Body } from '@nestjs/common';
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
    return { id: 'user-1', ...dto };
  }
}
`,

// Adicionar pipes globais
'backend/src/main.ts': `import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  
  // Adicionar validação global
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));
  
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3000);
}

void bootstrap();
`,
```

**Teste:**
```bash
cd /tmp/test-project/backend
npm install
npm run build

# Teste com cURL
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name": "João", "email": "invalid", "password": "123"}'
# Resultado: erro 400 com lista de validações
```

---

### SEC-002: Rate-Limiting Middleware

**O que fazer:**
1. Gerar middleware simples em memória
2. Aplicar globalmente no NestJS

**Alteração em `bin/create-memory-nest-kit.js` (writeNestApi)**

```javascript
'backend/src/middleware/rate-limit.middleware.ts': `import { Injectable, NestMiddleware, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';

const requestStore = new Map<string, { count: number; resetAt: number }>();

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: () => void) {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    
    if (!requestStore.has(ip)) {
      requestStore.set(ip, { count: 1, resetAt: now + 60000 });
      next();
      return;
    }

    const record = requestStore.get(ip)!;
    if (now > record.resetAt) {
      requestStore.set(ip, { count: 1, resetAt: now + 60000 });
      next();
      return;
    }

    if (record.count >= 100) {
      throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }

    record.count++;
    next();
  }
}
`,

// Usar no app.module.ts
'backend/src/app.module.ts': `import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
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
    consumer.apply(RateLimitMiddleware).forRoutes('*');
  }
}
`,
```

**Teste:**
```bash
# Simular 101 requests rápidos
for i in {1..101}; do 
  curl -s http://localhost:3000/api/health | jq . 
done
# Último deve retornar 429 Too Many Requests
```

---

## 🧠 Semana 1: Implementar AGENT-001 & AGENT-002

### AGENT-001: Especificação Estruturada de Agentes

**O que fazer:**
1. Criar template de especificação em `agents/AGENT-SPEC.md`
2. Usar em exemplo: `agents/backend-nest-v1.md`

**Criar arquivo:**

```markdown
# Agent Specification Template

## ID
agent-[name]-v[version]

## Missão
[1-2 frases, claro]

## Entrada Esperada
```
{
  "task_id": "uuid",
  "type": "enum",
  "scope": "description",
  "context": "required fields"
}
```
Constraints: [tamanho máximo, formato, validações]

## Saída Esperada
```
{
  "task_id": "uuid",
  "status": "success|partial|failed",
  "result": {...},
  "errors": []
}
```
Validação: [checklist de qualidade]

## Contexto Prioritário
- memory/00-global/mission.md
- memory/20-architecture/[domain].md
- [domain]/current-sprint.md

## Proibições Explícitas
- ❌ NUNCA modificar código sem ownership
- ❌ NUNCA criar nova rota sem ADR
- ❌ NUNCA ignorar validação de entrada

## Escala
- Complexidade: 1-10 (expertise required)
- Especialização: alta (muito específico) vs. baixa (genérico)
```

---

### AGENT-002: Melhorar Prompts com Few-Shot

**O que fazer:**
1. Expandir `prompts/worker-task-template.md` com exemplos
2. Criar `prompts/instruction-bundle-format.md`

**Criar arquivo: `prompts/instruction-bundle-format.md`**

```markdown
# Instruction Bundle Format

Use este formato para máxima clareza com LLMs.

## Estrutura Recomendada

\`\`\`
# [Task ID] Task Title

## 👤 Contexto (Quem você é)
- Você é especialista em: [domain]
- Objetivo: [clear, measurable]
- Nível de detalhe: [high/medium/low]

## 📥 Entrada
- Formato esperado:
\`\`\`json
{
  "type": "string",
  "data": {...}
}
\`\`\`
- Restrições:
  - Tamanho máximo: [limit]
  - Validações: [rules]

## 📤 Saída Esperada
- Formato obrigatório:
\`\`\`json
{
  "success": boolean,
  "result": {...},
  "errors": []
}
\`\`\`
- Validação final:
  - [ ] Campo X presente
  - [ ] Campo Y validado
  - [ ] Erros claros

## 🚫 Proibições (MUITO IMPORTANTE)
- NUNCA fazer: [x, y, z]
- NÃO tente: [a, b, c]
- Recuse se: [condition]

## ✅ Checklist Final (Você deve passar)
- [ ] Entendeu o objetivo
- [ ] Validou entrada conforme regras
- [ ] Gerou saída no formato exato
- [ ] Verificou proibições
- [ ] Incluiu erros se relevante

## 📚 Exemplos

### Exemplo 1: Sucesso
**Entrada:**
\`\`\`json
{...exemplo...}
\`\`\`
**Saída:**
\`\`\`json
{...esperada...}
\`\`\`

### Exemplo 2: Erro (o que NÃO fazer)
...
\`\`\`
```

**Atualizar: `prompts/worker-task-template.md`**

```markdown
# Worker Task Template

Você é um **[especialista em domain]**.

## Sua Tarefa
[Descrição clara da tarefa, 1-2 frases]

## Entrada
- Task ID: {{task_id}}
- Escopo: {{scope}}
- Contexto: [arquivo principal para ler]

## Saída Esperada
- Formato: JSON com fields [x, y, z]
- Validação: [checklist]

## Proibições
- ❌ Não criar nova estrutura sem coordenação
- ❌ Não alterar código fora do escopo
- ❌ Não ignorar testes

## Checklist Final
1. ✅ Tarefa completada conforme escopo?
2. ✅ Código passa em testes?
3. ✅ Documentação atualizada?
4. ✅ Risco mapeado?
5. ✅ Handoff pronto?
```

---

## 📚 Semana 1: Implementar DOC-001 (Estrutura)

**O que fazer:**
1. Reorganizar docs em estrutura profissional
2. Criar arquivo de índice

**Criar: `docs/INDEX.md`**

```markdown
# Documentação - Índice

## 🚀 Início (5 minutos)
- [O que é](/docs/01-getting-started/what-is-it.md)
- [Instalação](/docs/01-getting-started/installation.md)
- [Hello World](/docs/01-getting-started/hello-world.md)

## 🏗️ Conceitos Fundamentais
- [Memória Hierárquica](/docs/02-concepts/memory-hierarchy.md)
- [Agentes e Orquestração](/docs/02-concepts/agents.md)
- [Handoff e Continuidade](/docs/02-concepts/handoff.md)

## 🔧 Guia de Uso
- [Criar Novo Projeto](/docs/03-guide/create-project.md)
- [Adicionar Domínio](/docs/03-guide/add-domain.md)

## 🎓 Tutoriais
- [Caso 1: API Simples](/docs/04-tutorials/case-1.md)
- [Caso 2: Múltiplos Domínios](/docs/04-tutorials/case-2.md)

## 🔍 Referência
- [CLI Flags](/docs/05-reference/cli.md)
- [Schema de Memória](/docs/05-reference/schema.md)

## ⚙️ Avançado
- [Custom Agents](/docs/06-advanced/custom-agents.md)
- [Model-Specific Tuning](/docs/06-advanced/model-tuning.md)

## ❓ FAQ
- [Perguntas Frequentes](/docs/07-faq/index.md)
```

---

## 🔄 Próximas Semanas

Seguir a sequência:

**Semana 2:**
- [ ] SEC-003: Sanitização
- [ ] SEC-004: Testes
- [ ] AGENT-003: Protocolo de handoff
- [ ] ADR-001: Estrutura robusta

**Semana 3:**
- [ ] AI-OPT-001: Context packing
- [ ] MEM-001: 3 níveis de compactação
- [ ] AGILE-001: Sprint template

**Semana 4 (Continuação):**
- [ ] Completar Tier 1
- [ ] Iniciar Tier 2

---

## 🧪 Validar Implementação

Após cada implementação, executar:

```bash
# Gerar projeto novo
node bin/create-memory-nest-kit.js /tmp/validate-${date}

# Verificar estrutura
ls -la /tmp/validate-${date}/
find /tmp/validate-${date}/backend/src -name "*.ts" | wc -l

# Testes
cd /tmp/validate-${date}/backend
npm install
npm run build
npm run lint
npm test

# Sucesso?
echo "✅ Implementação validada"
```

---

## 📝 Atualizar Rastreamento

Após cada item completado:

```sql
UPDATE improvement_items 
SET status = 'done' 
WHERE id = 'SEC-001';

-- Verificar progresso
SELECT area_id, 
       COUNT(*) total,
       SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) completed,
       ROUND(100.0 * SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) / COUNT(*), 1) as pct
FROM improvement_items
GROUP BY area_id
ORDER BY area_id;
```

---

**Status**: Pronto para Implementação | **Data**: 2026-04-21 | **Próximo Review**: Semana 2

