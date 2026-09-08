/**
 * apps/cli/src/params.ts — mapeamento declarativo argv↔payload de um comando-capability
 * (SPEC-046, ADR-0083).
 *
 * `parseArgv` e `argvFor` são inversas. Um teste de round-trip
 * (`argvFor(params, parseArgv(params, argv)) === argv`) para todo spec é o contrato que impede
 * as duas de divergirem — o `if/else` por comando que existia antes não tinha esse contrato.
 *
 * Convenção de ordem em `argvFor`: os params são emitidos na ordem em que aparecem em `params`.
 * Um `positional` opcional só é seguro antes de outro `positional` se o anterior estiver sempre
 * presente — na prática, opcionais ficam por último.
 */

export interface InputRecord {
  readonly [key: string]: unknown;
}

export type CapabilityParam =
  | { readonly name: string; readonly kind: 'positional'; readonly required?: boolean; readonly parse?: 'string' | 'int' }
  | { readonly name: string; readonly kind: 'flag' }
  | { readonly name: string; readonly kind: 'flag-value'; readonly flag: string; readonly required?: boolean; readonly parse?: 'string' | 'int' }
  | { readonly name: string; readonly kind: 'rest'; readonly required?: boolean };

function coerce(value: string, parse: 'string' | 'int' | undefined): string | number {
  return parse === 'int' ? Number(value) : value;
}

/** argv → `{ [param.name]: value }`. Flags desconhecidas são ignoradas. */
export function parseArgv(params: readonly CapabilityParam[], argv: readonly string[]): InputRecord {
  const positionals = params.filter((p): p is Extract<CapabilityParam, { kind: 'positional' }> => p.kind === 'positional');
  const rest = params.find((p): p is Extract<CapabilityParam, { kind: 'rest' }> => p.kind === 'rest');
  const flagValues = new Map<string, Extract<CapabilityParam, { kind: 'flag-value' }>>(
    params
      .filter((p): p is Extract<CapabilityParam, { kind: 'flag-value' }> => p.kind === 'flag-value')
      .map((p) => [p.flag, p]),
  );
  const flags = new Map<string, Extract<CapabilityParam, { kind: 'flag' }>>(
    params
      .filter((p): p is Extract<CapabilityParam, { kind: 'flag' }> => p.kind === 'flag')
      .map((p) => [`--${p.name}`, p]),
  );

  const out: Record<string, unknown> = {};
  const restParts: string[] = [];
  let posIdx = 0;

  for (let i = 0; i < argv.length; i += 1) {
    const tok = argv[i];
    if (tok.startsWith('--')) {
      const fv = flagValues.get(tok);
      if (fv !== undefined) {
        const raw = argv[i + 1];
        if (raw !== undefined) {
          out[fv.name] = coerce(raw, fv.parse);
          i += 1;
        }
        continue;
      }
      const fl = flags.get(tok);
      if (fl !== undefined) {
        out[fl.name] = true;
        continue;
      }
      continue; // flag desconhecida — ignora
    }
    if (posIdx < positionals.length) {
      const p = positionals[posIdx];
      posIdx += 1;
      out[p.name] = coerce(tok, p.parse);
    } else if (rest !== undefined) {
      restParts.push(tok);
    }
  }

  if (rest !== undefined && restParts.length > 0) out[rest.name] = restParts.join(' ');
  return out;
}

/** `{ [param.name]: value }` → argv, na ordem de `params`. */
export function argvFor(params: readonly CapabilityParam[], input: InputRecord): string[] {
  const argv: string[] = [];
  for (const p of params) {
    const value = input[p.name];
    if (p.kind === 'positional') {
      if (value !== undefined) argv.push(String(value));
    } else if (p.kind === 'flag-value') {
      if (value !== undefined) argv.push(p.flag, String(value));
    } else if (p.kind === 'flag') {
      if (value === true) argv.push(`--${p.name}`);
    } else {
      // rest
      const text = value === undefined ? '' : String(value);
      if (text.length > 0) argv.push(...text.split(' '));
    }
  }
  return argv;
}

/**
 * Validador base a partir de `params`: exige os `required` presentes e o tipo certo
 * (`int` → número finito; resto → string). Specs com limite adicional (range, enum) embrulham
 * esta função.
 */
export function makeValidator(params: readonly CapabilityParam[]): (value: unknown) => InputRecord {
  return (value: unknown): InputRecord => {
    if (value === undefined || value === null) value = {};
    if (typeof value !== 'object' || Array.isArray(value)) throw new Error('input deve ser um objeto');
    const input = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const p of params) {
      const v = input[p.name];
      if (v === undefined) {
        if ('required' in p && p.required) throw new Error(`campo obrigatório ausente: ${p.name}`);
        continue;
      }
      const wantsInt = (p.kind === 'positional' || p.kind === 'flag-value') && p.parse === 'int';
      if (wantsInt) {
        if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${p.name} deve ser um número`);
      } else if (p.kind === 'flag') {
        if (typeof v !== 'boolean') throw new Error(`${p.name} deve ser booleano`);
      } else if (typeof v !== 'string' || v.trim().length === 0) {
        throw new Error(`${p.name} deve ser uma string não-vazia`);
      }
      out[p.name] = v;
    }
    return out;
  };
}
