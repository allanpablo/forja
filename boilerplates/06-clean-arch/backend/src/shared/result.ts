/**
 * Result<T> — sucesso ou falha de domínio, sem lançar exceção.
 *
 * O domínio devolve `Result` em vez de `throw` para que a regra de negócio seja um valor testável
 * (o teste lê `.isFailure`, não captura exceção) e para que a camada de aplicação decida o que
 * fazer com a falha. `throw` é reservado para o inesperado (bug), não para regra de negócio.
 */
export class Result<T> {
  private constructor(
    public readonly isSuccess: boolean,
    private readonly _value?: T,
    public readonly error?: string,
  ) {}

  get isFailure(): boolean {
    return !this.isSuccess;
  }

  /** Só chame após checar `isSuccess`. Falha aqui é bug, não regra. */
  get value(): T {
    if (!this.isSuccess) throw new Error(`Result sem valor: ${this.error}`);
    return this._value as T;
  }

  static ok<T>(value: T): Result<T> {
    return new Result(true, value);
  }

  static fail<T>(error: string): Result<T> {
    return new Result<T>(false, undefined, error);
  }
}
