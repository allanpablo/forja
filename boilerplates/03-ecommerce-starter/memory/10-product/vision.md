# Visão do Produto

## Declaração de Visão
"Uma plataforma de e-commerce moderna que permite empreendedores criar lojas online profissionais com controle total de inventário, pagamentos e análise de vendas."

## Personas Principais

### 1. **Proprietário da Loja (Store Owner)**
- **Objetivo**: Vender produtos online de forma fácil e profissional
- **Desafios**: Gerenciar múltiplos produtos, rastrear pedidos, processar pagamentos
- **Necessidades**: Dashboard simples, relatórios de vendas, gerenciamento de catálogo

### 2. **Cliente Final (Shopper)**
- **Objetivo**: Encontrar e comprar produtos de forma rápida e segura
- **Desafios**: Navegar catálogo grande, processar pagamento facilmente
- **Necessidades**: Busca/filtro, carrinho intuitivo, checkout rápido, rastreamento de pedido

### 3. **Gerente de Inventário (Inventory Manager)**
- **Objetivo**: Manter stock atualizado e evitar overselling
- **Desafios**: Sincronização em tempo real entre vendas e estoque
- **Necessidades**: Alertas de low stock, relatórios de movimento

## User Stories Críticas

### US-001: Catálogo de Produtos
```
Como cliente
Quero buscar, filtrar e visualizar produtos
Para encontrar o que desejo comprar facilmente
AC:
  - Listar produtos com paginação
  - Filtrar por categoria, preço, rating
  - Busca por nome/descrição
  - Tempo < 200ms
```

### US-002: Adicionar ao Carrinho
```
Como cliente
Quero adicionar itens ao carrinho e modificar quantidades
Para revisar antes de checkout
AC:
  - Adicionar item com quantidade
  - Remover item
  - Atualizar quantidade
  - Carrinho persiste (localStorage ou session)
```

### US-003: Checkout e Pagamento
```
Como cliente
Quero fazer checkout seguro e rápido
Para completar minha compra
AC:
  - Revisar items e total
  - Informações de entrega
  - Processar pagamento (mock)
  - Confirmação com número de pedido
```

### US-004: Rastreamento de Pedido
```
Como cliente
Quero acompanhar meu pedido
Para saber quando chegar
AC:
  - Ver status (pendente, processando, enviado, entregue)
  - Ver histórico de mudanças
  - Notificações de mudança de status
```

### US-005: Avaliações de Produtos
```
Como cliente
Quero avaliar produtos que comprei
Para ajudar outros clientes
AC:
  - 1-5 stars
  - Texto opcional
  - Mostrar media de ratings
```

## Requisitos Funcionais por Módulo

### Catálogo (Products + Categories)
- CRUD de produtos (create, read, update, delete)
- Categorias hierárquicas
- Imagens de produto (URL/upload)
- Preços e promoções
- Stock disponível

### Carrinho (Cart)
- Persistência de carrinho
- Cálculo de total com imposto (mock)
- Aplicação de cupons
- Validação de stock em checkout

### Pedidos (Orders)
- Criação automática no checkout
- Status workflow: pending → processing → shipped → delivered
- Detalhes do cliente e endereço
- Histórico completo

### Pagamentos (Payments)
- Mock Stripe: sim/não + transactionId
- Registro de tentativas
- Webhook simulado (future)

### Inventário (Inventory)
- Reserva de stock no checkout
- Sincronização com produtos
- Alerts para reposição
- Relatórios de movimento

### Cupons (Coupons)
- Código + desconto (% ou R$)
- Data de validade
- Uso máximo
- Aplicação em checkout

### Avaliações (Reviews)
- Rating + texto
- Moderação (future)
- Média exibida em produto
