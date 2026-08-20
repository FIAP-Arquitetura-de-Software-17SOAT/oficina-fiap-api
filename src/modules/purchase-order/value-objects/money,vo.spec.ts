import { Money } from './money.vo';

describe('Money', () => {
  describe('fromCents', () => {
    it('should create money from integer cents', () => {
      const money = Money.fromCents(15050);

      expect(money.valueInCents).toBe(15050);
      expect(money.value).toBe(150.5);
    });

    it('should allow zero', () => {
      const money = Money.fromCents(0);

      expect(money.valueInCents).toBe(0);
      expect(money.value).toBe(0);
    });

    it('should not allow negative values', () => {
      expect(() =>
        Money.fromCents(-100),
      ).toThrow(
        'O valor monetário não pode ser negativo',
      );
    });

    it('should not allow decimal cents', () => {
      expect(() =>
        Money.fromCents(100.5),
      ).toThrow(
        'O valor monetário deve ser representado em centavos inteiros',
      );
    });
  });

  describe('fromDecimal', () => {
    it('should convert decimal value to cents', () => {
      const money = Money.fromDecimal(150.5);

      expect(money.valueInCents).toBe(15050);
    });

    it('should correctly handle decimal precision', () => {
      const money = Money.fromDecimal(10.99);

      expect(money.valueInCents).toBe(1099);
    });

    it('should reject invalid monetary values', () => {
      expect(() =>
        Money.fromDecimal(Number.NaN),
      ).toThrow(
        'O valor monetário informado é inválido',
      );
    });
  });

  describe('add', () => {
    it('should add two monetary values', () => {
      const first = Money.fromCents(10000);
      const second = Money.fromCents(5050);

      const result = first.add(second);

      expect(result.valueInCents).toBe(15050);
    });
  });

  describe('multiply', () => {
    it('should multiply money by an integer quantity', () => {
      const money = Money.fromCents(15050);

      const result = money.multiply(2);

      expect(result.valueInCents).toBe(30100);
      expect(result.value).toBe(301);
    });

    it('should reject decimal quantity', () => {
      const money = Money.fromCents(1000);

      expect(() =>
        money.multiply(1.5),
      ).toThrow(
        'A quantidade utilizada no cálculo deve ser inteira',
      );
    });
  });

  describe('equals', () => {
    it('should return true for equal values', () => {
      const first = Money.fromCents(1000);
      const second = Money.fromCents(1000);

      expect(first.equals(second)).toBe(true);
    });

    it('should return false for different values', () => {
      const first = Money.fromCents(1000);
      const second = Money.fromCents(2000);

      expect(first.equals(second)).toBe(false);
    });
  });
});