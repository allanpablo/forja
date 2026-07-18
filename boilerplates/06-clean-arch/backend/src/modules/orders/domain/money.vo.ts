/**
 * Money — value object. Imutável, comparado por valor, valida a si mesmo na criação.
 * Zero dependência de framework: é TypeScript puro (o ponto do domínio isolado).
 */
export class Money {
  private constructor(public readonly cents: number) {}

  static of(cents: number): Money {
    if (!Number.isInteger(cents) || cents < 0) {
      throw new Error('Money exige inteiro não-negativo em centavos');
    }
    return new Money(cents);
  }

  static zero(): Money {
    return new Money(0);
  }

  plus(other: Money): Money {
    return new Money(this.cents + other.cents);
  }

  times(qty: number): Money {
    return Money.of(this.cents * qty);
  }

  isZero(): boolean {
    return this.cents === 0;
  }
}
