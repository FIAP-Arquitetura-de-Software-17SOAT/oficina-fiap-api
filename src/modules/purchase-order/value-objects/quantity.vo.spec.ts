import { Quantity } from './quantity.vo';

describe('Quantity', () => {
  it('should create a valid quantity', () => {
    const quantity = Quantity.create(5);

    expect(quantity.value).toBe(5);
  });

  it('should create quantity equal to one', () => {
    const quantity = Quantity.create(1);

    expect(quantity.value).toBe(1);
  });

  it('should reject zero', () => {
    expect(() =>
      Quantity.create(0),
    ).toThrow(
      'A quantidade deve ser maior que zero',
    );
  });

  it('should reject negative quantities', () => {
    expect(() =>
      Quantity.create(-1),
    ).toThrow(
      'A quantidade deve ser maior que zero',
    );
  });

  it('should reject decimal quantities', () => {
    expect(() =>
      Quantity.create(1.5),
    ).toThrow(
      'A quantidade deve ser um número inteiro',
    );
  });

  it('should compare equal quantities', () => {
    const first = Quantity.create(2);
    const second = Quantity.create(2);

    expect(first.equals(second)).toBe(true);
  });

  it('should compare different quantities', () => {
    const first = Quantity.create(2);
    const second = Quantity.create(3);

    expect(first.equals(second)).toBe(false);
  });
});