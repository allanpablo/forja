import { Order } from '../../src/modules/orders/domain/order.entity';
import { Money } from '../../src/modules/orders/domain/money.vo';

/**
 * A prova concreta do isolamento (AC-8): estes testes exercem a **regra de negócio** instanciando
 * SÓ o agregado de domínio — sem `Test.createTestingModule`, sem ORM, sem subir o Nest. Se um dia a
 * invariante precisar do framework para ser testada, o domínio vazou e a arquitetura falhou.
 */

const line = (cents: number, qty: number) => ({
  productId: 'p1',
  unitPrice: Money.of(cents),
  quantity: qty,
});

describe('Order (domínio, sem Nest)', () => {
  it('não cria pedido sem itens', () => {
    const r = Order.place('o1', 'c1', []);
    expect(r.isFailure).toBe(true);
    expect(r.error).toMatch(/ao menos um item/);
  });

  it('deriva o total das linhas', () => {
    const order = Order.place('o1', 'c1', [line(1000, 2), line(500, 1)]).value;
    expect(order.total.cents).toBe(2500);
  });

  it('NÃO envia sem pagamento — a invariante-chave', () => {
    const order = Order.place('o1', 'c1', [line(1000, 1)]).value;
    order.confirm();
    // pula o pay() de propósito
    const shipped = order.ship();
    expect(shipped.isFailure).toBe(true);
    expect(shipped.error).toMatch(/transição inválida/);
    expect(order.status.value).toBe('CONFIRMED');
  });

  it('envia quando pago — o caminho feliz da máquina de estados', () => {
    const order = Order.place('o1', 'c1', [line(1000, 1)]).value;
    order.confirm();
    order.pay();
    const shipped = order.ship();
    expect(shipped.isSuccess).toBe(true);
    expect(order.status.value).toBe('SHIPPED');
  });
});
