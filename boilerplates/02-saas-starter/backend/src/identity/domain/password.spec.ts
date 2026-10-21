import { hashPassword, verifyPassword } from './password.js';

describe('senha (scrypt)', () => {
  it('confere a senha certa e recusa a errada', async () => {
    const hash = await hashPassword('Correta-Senha-123');
    expect(await verifyPassword('Correta-Senha-123', hash)).toBe(true);
    expect(await verifyPassword('correta-senha-123', hash)).toBe(false);
  });

  it('gera hashes diferentes para a mesma senha (salt)', async () => {
    expect(await hashPassword('Igual-Senha-123')).not.toBe(await hashPassword('Igual-Senha-123'));
  });

  it('recusa hash malformado sem lançar', async () => {
    expect(await verifyPassword('x', 'bcrypt$abc')).toBe(false);
  });
});
