import { Money } from '../../../shared/domain/value-objects/money.vo';
import { Penalty } from './penalty.vo';

describe('Penalty', () => {
  const originalAmount = Money.fromCents(10000);
  const expiresAt = new Date('2026-08-20T10:00:00.000Z');

  it('keeps the original amount when billing is not overdue', () => {
    const penalty = Penalty.calculate({
      originalAmount,
      expiresAt,
      calculatedAt: new Date('2026-08-20T10:00:00.000Z'),
    });

    expect(penalty.getOverdueDays()).toBe(0);
    expect(penalty.getFixedPenaltyAmount().valueInCents).toBe(0);
    expect(penalty.getInterestAmount().valueInCents).toBe(0);
    expect(penalty.getTotalAmount().valueInCents).toBe(10000);
  });

  it('applies fixed penalty and daily prorated interest for one overdue day', () => {
    const penalty = Penalty.calculate({
      originalAmount,
      expiresAt,
      calculatedAt: new Date('2026-08-21T10:00:00.000Z'),
    });

    expect(penalty.getOverdueDays()).toBe(1);
    expect(penalty.getFixedPenaltyAmount().valueInCents).toBe(200);
    expect(penalty.getInterestAmount().valueInCents).toBe(3);
    expect(penalty.getTotalAmount().valueInCents).toBe(10203);
  });

  it('applies one month of simple interest after thirty overdue days', () => {
    const penalty = Penalty.calculate({
      originalAmount,
      expiresAt,
      calculatedAt: new Date('2026-09-19T10:00:00.000Z'),
    });

    expect(penalty.getOverdueDays()).toBe(30);
    expect(penalty.getFixedPenaltyAmount().valueInCents).toBe(200);
    expect(penalty.getInterestAmount().valueInCents).toBe(100);
    expect(penalty.getTotalAmount().valueInCents).toBe(10300);
  });

  it('rounds penalty values to whole cents', () => {
    const penalty = Penalty.calculate({
      originalAmount: Money.fromCents(9999),
      expiresAt,
      calculatedAt: new Date('2026-08-21T10:00:00.000Z'),
    });

    expect(penalty.getFixedPenaltyAmount().valueInCents).toBe(200);
    expect(penalty.getInterestAmount().valueInCents).toBe(3);
    expect(penalty.getTotalAmount().valueInCents).toBe(10202);
  });
});
