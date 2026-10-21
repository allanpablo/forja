/**
 * Configuração lida do ambiente uma vez, no boot. Segredos não têm valor padrão: sem eles a API não
 * sobe, em vez de subir assinando tokens com um segredo conhecido.
 */
export interface AppConfig {
  readonly port: number;
  readonly databaseUrl: string;
  readonly jwtSecret: string;
  readonly jwtRefreshSecret: string;
  readonly currency: string;
  readonly production: boolean;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const missing = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Variáveis de ambiente obrigatórias ausentes: ${missing.join(', ')} (veja .env.example)`);
  if (env.JWT_SECRET === env.JWT_REFRESH_SECRET) throw new Error('JWT_SECRET e JWT_REFRESH_SECRET precisam ser diferentes');
  if ((env.JWT_SECRET ?? '').length < 32 || (env.JWT_REFRESH_SECRET ?? '').length < 32) {
    throw new Error('JWT_SECRET e JWT_REFRESH_SECRET precisam ter pelo menos 32 caracteres');
  }
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`PORT inválida: ${env.PORT}`);
  return {
    port,
    databaseUrl: env.DATABASE_URL as string,
    jwtSecret: env.JWT_SECRET as string,
    jwtRefreshSecret: env.JWT_REFRESH_SECRET as string,
    currency: env.BILLING_CURRENCY ?? 'BRL',
    production: env.NODE_ENV === 'production',
  };
}
