# Data - Esquemas e Modelos

## PostgreSQL Schema

### Entities e Relacionamentos

```sql
-- Categories (Categorias)
CREATE TABLE categories (
  id UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  parent_id UUID REFERENCES categories(id),
  image_url VARCHAR(255),
  display_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Products (Produtos)
CREATE TABLE products (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  sku VARCHAR(50) NOT NULL UNIQUE,
  price DECIMAL(10, 2) NOT NULL,
  discount_percent INT DEFAULT 0,
  category_id UUID NOT NULL REFERENCES categories(id),
  image_url VARCHAR(255),
  rating FLOAT DEFAULT 0,
  review_count INT DEFAULT 0,
  status VARCHAR(50) DEFAULT 'active', -- active, inactive, discontinued
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Inventory (Estoque)
CREATE TABLE inventory (
  id UUID PRIMARY KEY,
  product_id UUID NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
  stock INT DEFAULT 0,
  reserved INT DEFAULT 0,
  reorder_point INT DEFAULT 10,
  reorder_quantity INT DEFAULT 100,
  last_restock_date TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Stock Movements (Movimentações de Estoque)
CREATE TABLE stock_movements (
  id UUID PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id),
  movement_type VARCHAR(50), -- in, out, reserve, release
  quantity INT NOT NULL,
  order_id UUID,
  reason VARCHAR(100), -- checkout, restock, adjustment, cancel
  created_at TIMESTAMP DEFAULT NOW()
);

-- Coupons (Cupons)
CREATE TABLE coupons (
  id UUID PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  discount_percent INT,
  discount_amount DECIMAL(10, 2),
  expires_at TIMESTAMP,
  max_uses INT,
  used_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Orders (Pedidos)
CREATE TABLE orders (
  id UUID PRIMARY KEY,
  user_id VARCHAR(100), -- Mock user
  status VARCHAR(50) DEFAULT 'pending', -- pending, processing, shipped, delivered, canceled
  subtotal DECIMAL(10, 2),
  tax DECIMAL(10, 2),
  discount_amount DECIMAL(10, 2) DEFAULT 0,
  total_amount DECIMAL(10, 2),
  coupon_id UUID REFERENCES coupons(id),
  shipping_address JSONB,
  billing_address JSONB,
  payment_id UUID,
  tracking_number VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Order Items (Itens do Pedido)
CREATE TABLE order_items (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  product_name VARCHAR(255),
  product_price DECIMAL(10, 2),
  quantity INT NOT NULL,
  subtotal DECIMAL(10, 2),
  discount_amount DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Payments (Pagamentos)
CREATE TABLE payments (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id),
  amount DECIMAL(10, 2),
  currency VARCHAR(3) DEFAULT 'BRL',
  status VARCHAR(50), -- pending, approved, declined, refunded
  method VARCHAR(50), -- credit_card, debit_card, pix
  card_last4 VARCHAR(4),
  stripe_transaction_id VARCHAR(255) UNIQUE,
  fees DECIMAL(10, 2),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Reviews (Avaliações)
CREATE TABLE reviews (
  id UUID PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id VARCHAR(100),
  rating INT, -- 1-5
  comment TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Order Status History (Histórico de Status)
CREATE TABLE order_status_history (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status VARCHAR(50),
  message VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Índices

```sql
-- Performance Índices
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_name ON products USING GIN (to_tsvector('english', name));
CREATE INDEX idx_inventory_product ON inventory(product_id);
CREATE INDEX idx_orders_user ON orders(user_id, created_at);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_reviews_product ON reviews(product_id);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_stock_movements_product ON stock_movements(product_id);
```

## Tipos de Dados

| Tipo | Uso | Exemplo |
|------|-----|---------|
| **UUID** | IDs únicos | product_id, order_id |
| **VARCHAR** | Strings curtas | name, sku, status |
| **TEXT** | Strings longas | description, comment |
| **DECIMAL(10, 2)** | Dinheiro | price, total (sempre 2 casas decimais) |
| **INT** | Contadores | quantity, stock, review_count |
| **FLOAT** | Ratings | rating (permite 4.5, etc) |
| **TIMESTAMP** | Datas/horas | created_at, updated_at |
| **JSONB** | Dados estruturados | shipping_address, billing_address |
| **BOOLEAN** | Verdadeiro/Falso | (future: is_published, etc) |

## Constraints Importantes

```sql
-- Preço sempre positivo
ALTER TABLE products ADD CONSTRAINT price_positive CHECK (price > 0);

-- Estoque não negativo
ALTER TABLE inventory ADD CONSTRAINT stock_non_negative CHECK (stock >= 0);
ALTER TABLE inventory ADD CONSTRAINT reserved_non_negative CHECK (reserved >= 0);

-- Quantidade de item > 0
ALTER TABLE order_items ADD CONSTRAINT qty_positive CHECK (quantity > 0);

-- Rating entre 1 e 5
ALTER TABLE reviews ADD CONSTRAINT rating_valid CHECK (rating >= 1 AND rating <= 5);

-- Desconto entre 0 e 100
ALTER TABLE products ADD CONSTRAINT discount_valid CHECK (discount_percent >= 0 AND discount_percent <= 100);
```

## Migrations (Future - TypeORM)

```bash
npm run migration:generate -- src/database/migrations/CreateProducts
npm run migration:run
```

## Backup Strategy

```bash
# Full backup
pg_dump -h localhost -U postgres -d ecommerce > backup.sql

# Restore
psql -h localhost -U postgres -d ecommerce < backup.sql

# Point-in-time recovery
# WAL archiving needed for PITR
```

## Performance Tips

1. **Indexes** - Criar índices em FKs e colunas consultadas frequentemente
2. **Connection Pooling** - Máximo 20 conexões PostgreSQL
3. **Query Optimization** - Usar EXPLAIN ANALYZE
4. **Partitioning** - Para tabelas muito grandes (future)
5. **Replication** - Standby PostgreSQL para failover (future)

## Monitoramento de Banco

```sql
-- Slow queries
SELECT query, mean_time FROM pg_stat_statements 
WHERE mean_time > 100 
ORDER BY mean_time DESC;

-- Tamanho das tabelas
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
FROM pg_tables
WHERE schemaname != 'pg_catalog'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Índices não utilizados
SELECT schemaname, tablename, indexname
FROM pg_stat_user_indexes
WHERE idx_scan = 0;
```

## SQLite (Alternativa Desenvolvimento)

Para desenvolvimento local sem Docker:

```sql
-- SQLite (mesmo schema, sintaxe ligeiramente diferente)
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  ...
);
```

## Redis (Cache - Future)

```
Keys estrutura:
- product:${id} → JSON do produto (TTL 30min)
- category:${slug}:products → IDs de produtos (TTL 1h)
- cart:${userId} → JSON do carrinho (TTL 24h)
- inventory:${productId} → Stock info (TTL 5min)
```
