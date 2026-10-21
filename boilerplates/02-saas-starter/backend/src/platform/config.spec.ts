import { loadConfig } from './config.js';

const ok = { DATABASE_URL: 'postgres://x', JWT_SECRET: 'a'.repeat(32), JWT_REFRESH_SECRET: 'b'.repeat(32) };

describe('configuração', () => {
  it('sem segredos a API não sobe (nada de segredo padrão)', () => {
    expect(() => loadConfig({ DATABASE_URL: 'postgres://x' })).toThrow(/JWT_SECRET, JWT_REFRESH_SECRET/);
  });

  it('segredos curtos ou iguais são recusados', () => {
    expect(() => loadConfig({ ...ok, JWT_SECRET: 'curto' })).toThrow(/32 caracteres/);
    expect(() => loadConfig({ ...ok, JWT_REFRESH_SECRET: ok.JWT_SECRET })).toThrow(/diferentes/);
  });

  it('valores padrão para porta e moeda', () => {
    expect(loadConfig(ok)).toMatchObject({ port: 3000, currency: 'BRL', production: false });
  });
});
