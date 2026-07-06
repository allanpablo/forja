# 🔌 API REST Boilerplate

**Caso de uso**: APIs RESTful, backends genéricos, microserviços

Uma API REST profissional com autenticação, validação, rate-limiting e testes.

---

## ⚡ Quick Start (5 minutos)

```bash
# 1. Criar projeto
node ../../bin/init-project.js minha-api --template api-rest

# 2. Setup
cd minha-api
npm install

# 3. Rodar
npm run start:dev

# 4. Testar
curl http://localhost:3000/api/health
# → {"status":"ok"}
```

---

## 📚 Estrutura

```
├── memory/                    ← Contexto API REST
├── backend/
│   ├── src/
│   │   ├── modules/products/  ← Exemplo completo
│   │   ├── config/            ← Configuração
│   │   └── middleware/        ← Auth, rate-limit
│   ├── test/                  ← E2E tests
│   └── docker-compose.yml
└── README.md
```

---

## 🎯 Endpoints

### Health Check
```bash
GET /api/health
→ {"status":"ok"}
```

### Autenticação
```bash
# Registrar
POST /api/auth/register
{
  "email": "user@example.com",
  "password": "secret123"
}

# Login
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "secret123"
}
→ {"access_token":"eyJh..."}
```

### Produtos (CRUD)
```bash
# Listar
GET /api/products?page=1&limit=10

# Criar (requer autenticação)
POST /api/products
Authorization: Bearer <token>
{
  "name": "Notebook",
  "price": 2500
}

# Atualizar
PATCH /api/products/1
Authorization: Bearer <token>
{
  "price": 2300
}

# Deletar
DELETE /api/products/1
Authorization: Bearer <token>
```

---

## 🔐 Autenticação

JWT token-based:

```bash
# 1. Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"secret"}'

# Response
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 3600
}

# 2. Usar em endpoints protegidos
curl http://localhost:3000/api/products \
  -H "Authorization: Bearer eyJhbGc..."
```

---

## 🚀 Features

✅ **Autenticação JWT**
- Login/Logout
- Token refresh
- Password hashing (bcrypt)

✅ **Validação**
- DTOs com class-validator
- Custom pipes
- Error handling

✅ **Rate Limiting**
- Por IP
- Por usuário
- Configurável

✅ **Paginação**
- Cursor-based
- Offset-based
- Meta informações

✅ **Testes**
- E2E completos
- Coverage > 80%
- Fixtures

✅ **Documentação**
- OpenAPI/Swagger
- Exemplos curl
- Deployment guide

---

## 📝 Desenvolvimento

### Adicionar Novo Endpoint

```bash
# 1. Gerar módulo
nest generate controller modules/usuarios
nest generate service modules/usuarios

# 2. Implementar
# backend/src/modules/usuarios/usuarios.controller.ts
@Controller('usuarios')
export class UsuariosController {
  @Get()
  findAll() {
    return this.service.findAll();
  }
}

# 3. Testar
npm run test:e2e
```

### Modificar Memory

```bash
# Contexto do domínio
cat memory/30-domains/produtos/context.md

# Regras de negócio
cat memory/30-domains/produtos/rules.md

# API specification
cat memory/30-domains/produtos/api.md
```

---

## 🧪 Testes

```bash
# Rodar E2E
npm run test:e2e

# Com coverage
npm run test:cov

# Watch mode
npm run test:watch
```

Exemplo de teste:

```typescript
describe('Products', () => {
  it('should create a product', () => {
    return request(app.getHttpServer())
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Notebook', price: 2500 })
      .expect(201)
      .expect(res => {
        expect(res.body).toHaveProperty('id');
      });
  });
});
```

---

## 🐳 Docker

```bash
# Iniciar
docker-compose up -d

# Logs
docker-compose logs -f api

# Parar
docker-compose down
```

---

## 📊 Performance

- **Rate Limit**: 100 req/min por IP
- **Response Time**: <100ms (média)
- **DB Pool**: 10 conexões simultâneas
- **Cache**: Redis (opcional)

---

## 🔧 Configuração

```bash
# .env
DATABASE_URL=postgresql://user:pass@localhost:5432/api
JWT_SECRET=sua-chave-secreta
NODE_ENV=development
LOG_LEVEL=debug
```

---

## 📦 Deploy

### Heroku
```bash
heroku create minha-api
git push heroku main
heroku open
```

### AWS
```bash
# Build
npm run build

# Push to ECR
docker build -t api .
aws ecr get-login-password | docker login --username AWS --password-stdin ...
docker tag api:latest ...
docker push ...

# ECS/Fargate
aws ecs run-task --cluster my-cluster --task-definition api:1
```

### Docker
```bash
docker build -t minha-api .
docker run -p 3000:3000 -e DATABASE_URL=... minha-api
```

---

## 🆘 Troubleshooting

**Erro: "Port 3000 already in use"**
```bash
PORT=3001 npm run start:dev
```

**Erro: "Cannot find database"**
```bash
docker-compose up -d postgres
npm run typeorm migration:run
```

**Erro: "JWT verification failed"**
```bash
# Verificar se o token está correto
# O token expira em 1 hora (3600s)
POST /api/auth/refresh-token
```

---

## 🎓 Próximas Etapas

1. ✅ Entender estrutura
2. ✅ Rodar localmente
3. ✅ Adicionar novo endpoint
4. ✅ Escrever teste
5. ✅ Deploy

---

## 📚 Recursos

- [NestJS Docs](https://docs.nestjs.com)
- [TypeORM Docs](https://typeorm.io)
- [JWT Docs](https://jwt.io)
- [Create Memory NestKit](../../README.md)

---

**Versão**: 0.3.1  
**Status**: 🟢 Production-Ready  
**Mantido por**: create-memory-nest-kit team
