import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Hash de senha com scrypt (node:crypto): sem dependência nativa para instalar. Formato:
 * `scrypt$N$r$p$<salt base64>$<hash base64>`, para os parâmetros poderem subir sem invalidar hashes antigos.
 */
const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const KEYLEN = 64;

function derive(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password.normalize('NFKC'), salt, KEYLEN, options, (err, key) => (err ? reject(err) : resolve(key))));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await derive(password, Buffer.from(salt, 'base64'), { N: Number(n), r: Number(r), p: Number(p), maxmem: PARAMS.maxmem });
  return key.length === expected.length && timingSafeEqual(key, expected);
}
