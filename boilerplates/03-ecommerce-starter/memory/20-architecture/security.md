# Segurança - Arquitetura

## Estratégias de Segurança

### 1. Autenticação e Autorização

#### JWT (Mock para MVP)
```typescript
// Login mock - retorna JWT válido por 1 hora
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "password123"
}

Response:
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600
}
```

#### Roles (RBAC)
- `user` - Cliente comum
- `admin` - Gerenciamento de produtos, pedidos
- `moderator` - Moderação de reviews

#### Proteção de Rotas
```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Delete('products/:id')
deleteProduct() { }
```

### 2. Validação de Input

Todos os DTOs usam `class-validator`:

```typescript
export class CreateProductDTO {
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  name: string;

  @IsNumber()
  @Min(0.01)
  price: number;

  @IsEmail()
  email?: string;
}
```

Estratégias:
- Validação de tipo
- Length validation
- Format validation (email, URL, date)
- Custom validators (CEP, CPF se necessário)

### 3. Proteção contra SQL Injection

TypeORM com queries parameterizadas:

```typescript
// ✅ SEGURO - Parameterizado
const query = productRepository.createQueryBuilder()
  .where('product.name ILIKE :search', { search: `%${search}%` });

// ❌ INSEGURO - Nunca fazer
const query = `SELECT * FROM products WHERE name LIKE '%${search}%'`;
```

### 4. Proteção contra XSS

- Dados armazenados escapados no banco
- APIs retornam JSON (não HTML)
- Frontend responsável por sanitização
- CSP headers recomendado em produção

### 5. CORS

```typescript
// app.module.ts
app.enableCors({
  origin: process.env.CORS_ORIGIN?.split(',') || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
```

### 6. Rate Limiting

Recomendado usar `@nestjs/throttler`:

```
- 100 requests/min por IP
- 5 login attempts/min
- 10 payment attempts/min por ordem
```

### 7. HTTPS e TLS

```
Produção:
- HTTPS 1.2+ obrigatório
- Certificate válido
- HSTS headers ativado
- SSL pinning opcional para mobile
```

### 8. Segurança de Dados Sensíveis

#### Não Armazenar
- ❌ Números completos de cartão (use tokenization Stripe)
- ❌ Senhas em plain text (hash com bcrypt)
- ❌ Tokens em localStorage (considere httpOnly cookies)

#### Armazenar Seguro
- ✅ last4 de cartão para referência
- ✅ Hash de senha com salt
- ✅ JWT tokens (stateless)

### 9. Auditoria e Logging

```json
{
  "timestamp": "2024-01-15T10:35:00Z",
  "level": "warn",
  "event": "payment_declined",
  "userId": "user-uuid",
  "orderId": "order-uuid",
  "errorCode": "card_declined",
  "ipAddress": "192.168.1.1"
}
```

Eventos críticos a logar:
- Autenticação (login, logout, falhas)
- Pagamentos (sucesso, recusa, reembolsos)
- Alterações de dados críticos (products, orders)
- Acesso admin
- Tentativas de acesso não autorizado

### 10. Proteção de Headers

```typescript
// Recomendado adicionar em produção
app.use(helmet());
// Headers:
// - X-Content-Type-Options: nosniff
// - X-Frame-Options: DENY
// - X-XSS-Protection: 1; mode=block
// - Strict-Transport-Security: max-age=31536000
```

### 11. CSRF Protection

Para requests que modificam dados:

```typescript
@Post()
@UseGuards(CsrfGuard)
createProduct() { }
```

### 12. Tratamento de Erros Seguro

```typescript
// ✅ SEGURO - Mensagem genérica
throw new BadRequestException('Invalid input');

// ❌ INSEGURO - Vaza detalhes
throw new Error(`Database: ${error.detail}`);
```

## Checklist de Segurança para Produção

- [ ] JWT_SECRET > 32 caracteres aleatórios
- [ ] HTTPS habilitado
- [ ] CORS restrito a domínios conhecidos
- [ ] Rate limiting ativo
- [ ] Logs estruturados em central log (ELK, Datadog, etc)
- [ ] Backup automático do banco
- [ ] Disaster recovery testado
- [ ] Dados pessoais (PII) criptografados
- [ ] Secrets em environment, nunca em código
- [ ] Dependency scanning (npm audit)
- [ ] Security headers via helmet
- [ ] HTTPS redirect habilitado
- [ ] Session timeout implementado
- [ ] Monitoring e alertas ativados

## Conformidade Regulatória

### LGPD (Lei Geral de Proteção de Dados)
- ✅ Consentimento explícito na compra
- ✅ Direito ao esquecimento (soft delete)
- ✅ Política de privacidade disponível
- ✅ Dados retidos máximo 90 dias após deleção
- ✅ Criptografia em repouso (future)

### PCI-DSS (Para processamento real de cartão)
- ❌ Números de cartão nunca armazenam
- ❌ Usar tokenização (real Stripe, não mock)
- ❌ Compliance com padrão de indústria

## Responsabilidades

| Camada | Responsável | O que fazer |
|--------|------------|------------|
| **API** | Backend | Validação, autenticação, rate limiting |
| **Transport** | DevOps | HTTPS, firewall, DDoS protection |
| **Aplicação** | Dev | DTOs validados, sem SQL injection |
| **Frontend** | Frontend Dev | Sanitização de output, CSRF tokens |
| **Operações** | DBA/DevOps | Backups, patches, monitoring |

## Referências

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [NestJS Security](https://docs.nestjs.com/security)
- [TypeORM Security](https://typeorm.io/)
- [PCI-DSS Compliance](https://www.pcisecuritystandards.org/)
- [LGPD](https://www.gov.br/cidadania/pt-br/acesso-a-informacao/lgpd)
