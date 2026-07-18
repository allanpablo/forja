import { Result } from '../../../shared/result';
import { Money } from './money.vo';
import { OrderStatus } from './order-status.vo';

/**
 * Order — o agregado. **Toda invariante de negócio mora aqui**, em TypeScript puro:
 *
 *   - não confirma um pedido sem itens;
 *   - não paga o que não foi confirmado; não envia o que não foi pago;
 *   - o total é derivado das linhas, nunca setado de fora.
 *
 * Nenhum import de `@nestjs` ou de ORM. É isso que torna `place-order.spec.ts` capaz de testar a
 * regra instanciando só este objeto — sem subir o Nest. Se um dia precisar do framework para testar
 * a invariante, o domínio vazou.
 */

export interface OrderLine {
  readonly productId: string;
  readonly unitPrice: Money;
  readonly quantity: number;
}

export class Order {
  private constructor(
    public readonly id: string,
    public readonly customerId: string,
    private _lines: OrderLine[],
    private _status: OrderStatus,
  ) {}

  /** Cria um pedido em rascunho. Regra: precisa de ao menos uma linha. */
  static place(id: string, customerId: string, lines: OrderLine[]): Result<Order> {
    if (lines.length === 0) {
      return Result.fail('um pedido precisa de ao menos um item');
    }
    if (lines.some((l) => l.quantity <= 0)) {
      return Result.fail('quantidade de item deve ser positiva');
    }
    return Result.ok(new Order(id, customerId, [...lines], OrderStatus.draft()));
  }

  /** Reconstrói do estado persistido (usado pelo mapper da infra — sem revalidar regra de criação). */
  static rehydrate(id: string, customerId: string, lines: OrderLine[], status: OrderStatus): Order {
    return new Order(id, customerId, lines, status);
  }

  get status(): OrderStatus {
    return this._status;
  }

  get lines(): readonly OrderLine[] {
    return this._lines;
  }

  /** Total derivado das linhas — nunca um campo setável de fora. */
  get total(): Money {
    return this._lines.reduce((acc, l) => acc.plus(l.unitPrice.times(l.quantity)), Money.zero());
  }

  confirm(): Result<void> {
    return this.transition('CONFIRMED');
  }

  /** Invariante-chave: só paga o confirmado. */
  pay(): Result<void> {
    return this.transition('PAID');
  }

  /** Invariante-chave: **não envia sem pagamento**. A transição só é legal a partir de PAID. */
  ship(): Result<void> {
    return this.transition('SHIPPED');
  }

  cancel(): Result<void> {
    return this.transition('CANCELLED');
  }

  private transition(to: Parameters<OrderStatus['canTransitionTo']>[0]): Result<void> {
    if (!this._status.canTransitionTo(to)) {
      return Result.fail(`transição inválida: ${this._status.value} → ${to}`);
    }
    this._status = OrderStatus.from(to);
    return Result.ok(undefined);
  }
}
