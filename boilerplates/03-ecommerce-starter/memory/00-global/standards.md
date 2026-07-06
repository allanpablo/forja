# Padrões Técnicos e Convenções

## Código
- **Linguagem**: TypeScript (strict mode)
- **Framework**: NestJS com arquitetura modular
- **Convenção de Nomes**:
  - Classes: PascalCase (ProductService, CartController)
  - Métodos: camelCase (getProducts, addToCart)
  - Constantes: UPPER_SNAKE_CASE
  - Variáveis: camelCase
- **Organização**: One file per class/interface
- **Imports**: Agrupar por externa → interna → relativa

## Banco de Dados
- **Database**: PostgreSQL
- **Migrations**: TypeORM CLI
- **Entities**: Uma entity por arquivo
- **Relacionamentos**: lazy loading onde apropriado
- **Índices**: Em campos frequentemente consultados (product_id, user_id)

## API
- **Versionamento**: `/api/v1` (future-ready)
- **Respostas**: JSON com estrutura consistente
- **Erros**: HTTP status codes semânticos + error codes internos
- **Paginação**: offset/limit padrão
- **Rate Limiting**: 100 requests/min por cliente

## Testes
- **Framework**: Jest
- **Coverage**: > 80% para módulos críticos
- **E2E**: Fluxos de checkout, pagamento, pedidos
- **Naming**: `*.spec.ts` (unitários), `*.e2e-spec.ts` (integração)

## Segurança
- **Auth**: JWT com refresh tokens
- **CORS**: Configurável por ambiente
- **Inputs**: Validação com class-validator + sanitização
- **Secrets**: Via .env (não em código)
- **HTTPS**: Obrigatório em produção

## Documentação
- **Memory**: 10 níveis por domínio
- **API Docs**: Swagger via NestJS decorators
- **README**: Setup, arquitetura, exemplos curl
- **Commits**: Semantic versioning (feat:, fix:, docs:)
