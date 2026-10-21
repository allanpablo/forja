import { InvalidPlanChange, monthlyPeriod, Subscription } from './subscription.js';

describe('Assinatura', () => {
  it('começa no plano free, no período mensal em UTC do momento', () => {
    const s = Subscription.start('s1', 't1', new Date('2026-03-15T23:30:00-03:00')).snapshot;
    expect(s.plan).toBe('free');
    expect(s.periodStart.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(s.periodEnd.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });

  it('virada de ano no período mensal', () => {
    const { start, end } = monthlyPeriod(new Date('2026-12-31T12:00:00Z'));
    expect([start.toISOString(), end.toISOString()]).toEqual(['2026-12-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z']);
  });

  it('transição inválida lança e deixa a assinatura como estava', () => {
    const sub = Subscription.start('s1', 't1', new Date());
    sub.changePlan('enterprise');
    expect(() => sub.changePlan('free')).toThrow(InvalidPlanChange);
    expect(sub.snapshot.plan).toBe('enterprise');
  });

  it('mudar para o mesmo plano não é erro', () => {
    const sub = Subscription.start('s1', 't1', new Date());
    sub.changePlan('free');
    expect(sub.snapshot.plan).toBe('free');
  });
});
