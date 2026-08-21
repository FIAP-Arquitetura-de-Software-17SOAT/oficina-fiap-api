import { DomainException } from '../../../shared/domain/domain.exception';
import { Money } from './money';

describe('Money', () => {
  it.each([
    ['0', '0.00'],
    ['149.9', '149.90'],
    [' 000149.90 ', '149.90'],
  ])('normalizes %s as %s', (input, expected) => {
    const money = Money.create(input);

    expect(money.getValue()).toBe(expected);
    expect(String(money)).toBe(expected);
  });

  it.each(['-0.01', '12.345', '1e3', '', 'abc'])(
    'rejects an unsafe decimal representation (%s)',
    (input) => {
      expect(() => Money.create(input)).toThrow(DomainException);
    },
  );

  it('rejects an amount that exceeds the database precision', () => {
    expect(() => Money.create('10000000000.00')).toThrow(DomainException);
  });

  it('compares normalized monetary amounts', () => {
    expect(Money.create('1.5').equals(Money.create('1.50'))).toBe(true);
  });
});
