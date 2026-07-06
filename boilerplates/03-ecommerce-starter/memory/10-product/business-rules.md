# Regras de Negócio

## Preços e Promoções
- Preço base é obrigatório (> 0)
- Promoções podem ser por cupom ou hardcoded em produto
- Desconto máximo: 100% (produto grátis permitido)
- Imposto: 15% calculado no checkout (simplificado)
- Total = (subtotal com desconto) * 1.15

## Carrinho
- Carrinho máximo: 100 itens
- Quantidade mínima por item: 1
- Quantidade máxima por item: 1000
- Carrinho vazio após 30 dias de inatividade (cookie)
- Um cupom por carrinho

## Pedidos
- Pedido = tudo ou nada (transação atômica)
- Se stock insuficiente → falha no checkout
- Número de pedido: UUID
- Apenas clientes autenticados podem fazer pedidos (para MVP, mock user)
- Histórico de pedido imutável

## Inventário
- Stock negativo NÃO permitido
- Reposição manual (input de gerente)
- Alerta quando < 5 unidades
- Reserva de stock ocorre no checkout (não em "add to cart")

## Pagamentos (Mock Stripe)
- Taxa simulada: 2.9% + R$0.30 por transação
- Lógica simples: 90% sucesso, 10% falha (aleatório)
- Transação bem-sucedida → order status = processing
- Transação falha → libera stock, order status = failed

## Avaliações
- Apenas comprador pode avaliar seu próprio pedido
- Uma avaliação por item de pedido
- Números de 1-5 (sem 0 ou decimais)
- Texto até 500 caracteres
- Não há exclusão (soft delete opcional)

## Segurança
- Sem autenticação real em MVP (mock JWT)
- Senhas não são armazenadas em MVP
- HTTPS obrigatório em produção
- Rate limiting: 100 req/min por IP
- Validação de input obrigatória

## Performance
- Produtos listados com paginação (padrão: 20 por página)
- Cache Redis para:
  - Categorias (TTL 1h)
  - Produtos top-sellers (TTL 30min)
  - Carrinho (TTL 24h)
- Busca full-text em nome/descrição (ILIKE em PostgreSQL)

## Conformidade
- LGPD: Dados de cliente não são exportados (apenas em solicitação)
- Termos de serviço aceitos no checkout (mock)
- Política de privacidade disponível
- Cancelamento de conta = soft delete (dados retidos 90 dias)
