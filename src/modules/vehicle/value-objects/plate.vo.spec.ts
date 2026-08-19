import { DomainException } from '../../../shared/domain/domain.exception';
import { Plate } from './plate.vo';

describe('Plate', () => {
  describe('formato antigo', () => {
    it('aceita três letras e quatro dígitos', () => {
      expect(Plate.create('ABC1234').getValue()).toBe('ABC1234');
    });

    it('não é Mercosul', () => {
      expect(Plate.create('ABC1234').isMercosul()).toBe(false);
    });
  });

  describe('formato Mercosul', () => {
    it('aceita três letras, dígito, letra e dois dígitos', () => {
      expect(Plate.create('ABC1D23').getValue()).toBe('ABC1D23');
    });

    it('é reconhecida como Mercosul', () => {
      expect(Plate.create('ABC1D23').isMercosul()).toBe(true);
    });
  });

  describe('normalização', () => {
    it.each([
      ['ABC-1234', 'ABC1234'],
      ['abc1234', 'ABC1234'],
      ['abc-1d23', 'ABC1D23'],
      ['ABC 1D23', 'ABC1D23'],
      ['  abc1d23  ', 'ABC1D23'],
    ])('normaliza "%s" para %s', (input, expected) => {
      expect(Plate.create(input).getValue()).toBe(expected);
    });
  });

  describe('recusa', () => {
    it.each([
      ['ABCD123', 'quatro letras na frente'],
      ['AB1234', 'só duas letras'],
      ['ABC123', 'dígitos de menos'],
      ['ABC12345', 'dígitos demais'],
      ['1234ABC', 'ordem invertida'],
      ['ABCD1E23', 'Mercosul com letra a mais'],
      ['ABC1DD3', 'Mercosul com duas letras no meio'],
      ['', 'string vazia'],
      ['-------', 'só separadores'],
    ])('rejeita "%s" (%s)', (input) => {
      expect(() => Plate.create(input)).toThrow(DomainException);
    });

    it('rejeita valor nulo vindo de fora do TypeScript', () => {
      expect(() => Plate.create(null as unknown as string)).toThrow(
        'Placa inválida',
      );
    });
  });

  describe('igualdade por valor', () => {
    it('considera iguais placas que só diferem em máscara e caixa', () => {
      expect(Plate.create('abc-1d23').equals(Plate.create('ABC1D23'))).toBe(
        true,
      );
    });

    it('considera diferentes placas distintas', () => {
      expect(Plate.create('ABC1234').equals(Plate.create('XYZ9876'))).toBe(
        false,
      );
    });
  });

  it('expõe o valor em toString', () => {
    expect(String(Plate.create('abc-1d23'))).toBe('ABC1D23');
  });
});
