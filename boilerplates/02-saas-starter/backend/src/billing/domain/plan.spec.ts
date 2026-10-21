import { canChangePlan, isPlanId, PLANS } from './plan.js';

describe('política de planos', () => {
  it.each([
    { from: 'free', to: 'pro', ok: true },
    { from: 'free', to: 'enterprise', ok: true },
    { from: 'pro', to: 'free', ok: true },
    { from: 'pro', to: 'enterprise', ok: true },
    { from: 'enterprise', to: 'pro', ok: false },
    { from: 'enterprise', to: 'free', ok: false },
  ] as const)('$from → $to: $ok', ({ from, to, ok }) => {
    expect(canChangePlan(from, to)).toBe(ok);
  });

  it('preços são centavos inteiros', () => {
    for (const plan of Object.values(PLANS)) expect(Number.isSafeInteger(plan.monthlyPriceCents)).toBe(true);
  });

  it('reconhece só os planos da tabela', () => {
    expect(isPlanId('pro')).toBe(true);
    expect(isPlanId('gold')).toBe(false);
  });
});
