import { DomainException } from '../../../shared/domain/domain.exception';
import { Quantity } from './quantity';

describe('Quantity', () => {
  it.each([0, 1, 42])('accepts a non-negative integer (%i)', (input) => {
    expect(Quantity.create(input).getValue()).toBe(input);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects an invalid quantity (%p)',
    (input) => {
      expect(() => Quantity.create(input)).toThrow(DomainException);
    },
  );

  it('rejects a value outside JavaScript safe integer range', () => {
    expect(() => Quantity.create(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      DomainException,
    );
  });

  it('compares quantities by their value', () => {
    expect(Quantity.create(3).equals(Quantity.create(3))).toBe(true);
    expect(Quantity.create(3).equals(Quantity.create(4))).toBe(false);
  });
});
