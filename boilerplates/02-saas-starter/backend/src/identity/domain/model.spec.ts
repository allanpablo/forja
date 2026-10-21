import { normalizeEmail, toSlug } from './model.js';

describe('identidade', () => {
  it.each([
    { name: 'minúsculas e hífens', input: 'Minha Empresa', want: 'minha-empresa' },
    { name: 'remove acentos', input: 'Ação & Cia', want: 'acao-cia' },
    { name: 'apara separadores nas pontas', input: '  --Loja--  ', want: 'loja' },
  ])('slug: $name', ({ input, want }) => {
    expect(toSlug(input)).toBe(want);
  });

  it('slug sem letras nem números é recusado', () => {
    expect(() => toSlug('!!!')).toThrow();
  });

  it('e-mail é comparado em minúsculas e sem espaços', () => {
    expect(normalizeEmail('  Ana@Exemplo.COM ')).toBe('ana@exemplo.com');
  });
});
