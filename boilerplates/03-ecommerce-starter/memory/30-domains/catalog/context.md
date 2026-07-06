# Domínio: Catálogo de Produtos

## Contexto
O módulo de catálogo é responsável por gerenciar o acervo de produtos disponíveis para venda. Inclui produtos, categorias, imagens e metadados.

## Entidades

### Product
- `id` (UUID): Identificador único
- `name` (string, 3-255): Nome do produto
- `description` (text, nullable): Descrição detalhada
- `sku` (string, unique): Stock Keeping Unit para referência interna
- `price` (decimal): Preço base em R$
- `discount_percent` (int, 0-100): Desconto aplicado automaticamente
- `categoryId` (FK): Referência à categoria
- `imageUrl` (string, nullable): URL da imagem principal
- `rating` (float, 0-5): Média de avaliações
- `reviewCount` (int): Quantidade de reviews
- `status` (enum): active | inactive | discontinued
- `createdAt` (timestamp): Data de criação
- `updatedAt` (timestamp): Última atualização

### Category
- `id` (UUID): Identificador único
- `name` (string, 1-100): Nome da categoria
- `slug` (string, unique): URL-friendly name
- `description` (text, nullable): Descrição
- `parentId` (FK, nullable): Para subcategorias
- `imageUrl` (string, nullable): Ícone/imagem
- `displayOrder` (int): Ordem de exibição
- `createdAt` (timestamp)

## API REST

### Listar Produtos
```
GET /api/products
Query params:
  - page: int (default: 1)
  - limit: int (default: 20, max: 100)
  - category: string (slug)
  - search: string (nome/descrição)
  - minPrice: decimal
  - maxPrice: decimal
  - sortBy: price | rating | newest (default: price)
  - order: asc | desc

Response (200):
{
  "data": [
    {
      "id": "uuid",
      "name": "Produto X",
      "price": 99.90,
      "discount_percent": 10,
      "finalPrice": 89.91,
      "rating": 4.5,
      "reviewCount": 23,
      "imageUrl": "https://..."
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

### Detalhes do Produto
```
GET /api/products/:id

Response (200):
{
  "id": "uuid",
  "name": "Produto X",
  "description": "Descrição completa...",
  "sku": "SKU-001",
  "price": 99.90,
  "discount_percent": 10,
  "finalPrice": 89.91,
  "category": {
    "id": "uuid",
    "name": "Eletrônicos",
    "slug": "eletronicos"
  },
  "rating": 4.5,
  "reviewCount": 23,
  "imageUrl": "https://...",
  "status": "active",
  "createdAt": "2024-01-10T10:30:00Z"
}
```

### Criar Produto (Admin)
```
POST /api/products
Authorization: Bearer <admin-jwt>

Body:
{
  "name": "Novo Produto",
  "description": "Descrição...",
  "sku": "SKU-002",
  "price": 199.90,
  "discount_percent": 0,
  "categoryId": "uuid",
  "imageUrl": "https://...",
  "status": "active"
}

Response (201):
{
  "id": "uuid-gerado",
  "name": "Novo Produto",
  ...
}
```

### Atualizar Produto (Admin)
```
PUT /api/products/:id
Authorization: Bearer <admin-jwt>

Body: (campos opcionais)
{
  "name": "Novo Nome",
  "price": 149.90,
  "discount_percent": 5,
  "status": "inactive"
}

Response (200): Produto atualizado
```

### Deletar Produto (Admin)
```
DELETE /api/products/:id
Authorization: Bearer <admin-jwt>

Response (204): No Content
```

### Listar Categorias
```
GET /api/categories

Response (200):
{
  "data": [
    {
      "id": "uuid",
      "name": "Eletrônicos",
      "slug": "eletronicos",
      "imageUrl": "https://...",
      "displayOrder": 1,
      "subcategories": [
        {
          "id": "uuid",
          "name": "Smartphones",
          "slug": "smartphones",
          "displayOrder": 1
        }
      ]
    }
  ]
}
```

## Regras de Negócio - Catálogo

1. **Preço**: Obrigatório, > 0
2. **SKU**: Único, não pode ser alterado
3. **Categoria**: Obrigatória, deve existir
4. **Status**: Apenas produtos "active" aparecem em listagem pública
5. **Desconto**: 0-100%, aplicado automaticamente ao preço
6. **Final Price**: = price * (1 - discount_percent/100)
7. **Rating**: Calculado automaticamente (média de reviews)
8. **Imagem**: URL validada, pode ser null

## Fluxo Típico

1. Admin cria categoria (ex: "Eletrônicos")
2. Admin cria produtos associados
3. Cliente acessa `GET /api/products`
4. Cliente filtra por categoria `GET /api/products?category=eletronicos`
5. Cliente vê detalhes `GET /api/products/:id`
6. (Depois) Cliente avalia em `/reviews`

## Performance

- Listar com paginação padrão 20 itens
- Busca por nome: ILIKE com índice
- Filtro por categoria: FK index
- Cache de produtos populares por 30min
- Limite de 100 itens máximo por page

## Validações

| Campo | Regra |
|-------|-------|
| name | 3-255 chars, não vazio |
| description | max 2000 chars, opcional |
| sku | 1-50 chars, único, alphanumeric |
| price | > 0, 2 casas decimais |
| discount_percent | 0-100, int |
| categoryId | deve existir |
| imageUrl | URL válida ou null |
