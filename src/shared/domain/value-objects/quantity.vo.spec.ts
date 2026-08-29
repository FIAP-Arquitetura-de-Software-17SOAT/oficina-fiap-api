import { DomainException } from '../domain.exception';
import { Quantity } from './quantity.vo';

describe('Quantity (VO compartilhado)', () => {
  describe('create — saldo em estoque', () => {
    it('aceita zero, porque prateleira vazia é um saldo válido', () => {
      expect(Quantity.create(0).getValue()).toBe(0);
      expect(Quantity.create(0).isZero()).toBe(true);
    });

    it('aceita inteiro positivo', () => {
      expect(Quantity.create(7).getValue()).toBe(7);
    });

    it.each([[-1], [-10]])('recusa saldo negativo (%p)', (input) => {
      expect(() => Quantity.create(input)).toThrow(
        'A quantidade não pode ser negativa',
      );
    });

    it.each([[1.5], [Number.NaN], [Number.POSITIVE_INFINITY]])(
      'recusa não inteiro (%p)',
      (input) => {
        expect(() => Quantity.create(input)).toThrow(
          'A quantidade deve ser um número inteiro',
        );
      },
    );
  });

  describe('positive — quantidade movimentada', () => {
    it('aceita inteiro maior que zero', () => {
      expect(Quantity.positive(3).getValue()).toBe(3);
    });

    it('recusa zero: movimentar nada não é um fato de negócio', () => {
      expect(() => Quantity.positive(0)).toThrow(
        'A quantidade deve ser maior que zero',
      );
    });

    it('recusa negativo', () => {
      expect(() => Quantity.positive(-2)).toThrow(DomainException);
    });
  });

  describe('aritmética', () => {
    it('soma', () => {
      expect(Quantity.create(4).add(Quantity.positive(3)).getValue()).toBe(7);
    });

    it('subtrai', () => {
      expect(
        Quantity.create(10).subtract(Quantity.positive(4)).getValue(),
      ).toBe(6);
    });

    it('recusa subtração que deixaria o saldo negativo', () => {
      expect(() => Quantity.create(2).subtract(Quantity.positive(5))).toThrow(
        'A quantidade não pode ser negativa',
      );
    });

    it('isAtLeast compara saldo com necessidade', () => {
      expect(Quantity.create(5).isAtLeast(Quantity.positive(5))).toBe(true);
      expect(Quantity.create(5).isAtLeast(Quantity.positive(6))).toBe(false);
    });

    it('zero() devolve saldo vazio', () => {
      expect(Quantity.zero().getValue()).toBe(0);
    });

    it('equals compara pelo valor', () => {
      expect(Quantity.create(3).equals(Quantity.positive(3))).toBe(true);
      expect(Quantity.create(3).equals(Quantity.create(4))).toBe(false);
    });
  });
});
