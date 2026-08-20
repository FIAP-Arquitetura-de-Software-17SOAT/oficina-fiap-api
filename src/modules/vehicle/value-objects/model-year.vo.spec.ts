import { DomainException } from '../../../shared/domain/domain.exception';
import { ModelYear } from './model-year.vo';

const anoAtual = new Date().getFullYear();

describe('ModelYear', () => {
  it('aceita um ano dentro da faixa', () => {
    expect(ModelYear.create(2022).getValue()).toBe(2022);
  });

  it('aceita o limite inferior', () => {
    expect(ModelYear.create(1900).getValue()).toBe(1900);
  });

  it('aceita o ano que vem, porque a montadora antecipa o modelo', () => {
    expect(ModelYear.create(anoAtual + 1).getValue()).toBe(anoAtual + 1);
  });

  it('recusa dois anos à frente', () => {
    expect(() => ModelYear.create(anoAtual + 2)).toThrow(DomainException);
  });

  it('recusa ano anterior a 1900', () => {
    expect(() => ModelYear.create(1899)).toThrow(DomainException);
  });

  it.each([[2022.5], [NaN], [Infinity]])(
    'recusa %p, que não é inteiro',
    (input) => {
      expect(() => ModelYear.create(input)).toThrow(
        'Ano do veículo deve ser um número inteiro',
      );
    },
  );

  it('a mensagem de erro informa a faixa válida', () => {
    expect(() => ModelYear.create(1800)).toThrow(
      `Ano do veículo deve estar entre 1900 e ${anoAtual + 1}`,
    );
  });

  describe('igualdade por valor', () => {
    it('considera iguais dois anos iguais', () => {
      expect(ModelYear.create(2022).equals(ModelYear.create(2022))).toBe(true);
    });

    it('considera diferentes dois anos distintos', () => {
      expect(ModelYear.create(2022).equals(ModelYear.create(2023))).toBe(false);
    });
  });

  it('expõe o valor em toString', () => {
    expect(String(ModelYear.create(2022))).toBe('2022');
  });
});
