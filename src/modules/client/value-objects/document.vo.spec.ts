import { DomainException } from '../../../shared/domain/domain.exception';
import { Document } from './document.vo';

const VALID_CPF = '52998224725';
const VALID_CNPJ = '11222333000181';

describe('Document', () => {
  describe('CPF', () => {
    it('aceita um CPF válido sem máscara', () => {
      expect(Document.create(VALID_CPF).getValue()).toBe(VALID_CPF);
    });

    it('remove a máscara e persiste apenas os dígitos', () => {
      expect(Document.create('529.982.247-25').getValue()).toBe(VALID_CPF);
    });

    it('rejeita CPF com dígito verificador errado', () => {
      expect(() => Document.create('52998224726')).toThrow(DomainException);
    });

    it('rejeita CPF com todos os dígitos iguais', () => {
      expect(() => Document.create('11111111111')).toThrow(DomainException);
    });

    it('rejeita CPF com quantidade de dígitos inválida', () => {
      expect(() => Document.create('5299822472')).toThrow(DomainException);
    });

    it('não é pessoa jurídica', () => {
      expect(Document.create(VALID_CPF).isLegalEntity()).toBe(false);
    });
  });

  describe('CNPJ', () => {
    it('aceita um CNPJ válido sem máscara', () => {
      expect(Document.create(VALID_CNPJ).getValue()).toBe(VALID_CNPJ);
    });

    it('remove a máscara e persiste apenas os dígitos', () => {
      expect(Document.create('11.222.333/0001-81').getValue()).toBe(VALID_CNPJ);
    });

    it('rejeita CNPJ com dígito verificador errado', () => {
      expect(() => Document.create('11222333000182')).toThrow(DomainException);
    });

    it('rejeita CNPJ com todos os dígitos iguais', () => {
      expect(() => Document.create('11111111111111')).toThrow(DomainException);
    });

    it('é pessoa jurídica', () => {
      expect(Document.create(VALID_CNPJ).isLegalEntity()).toBe(true);
    });
  });

  describe('entrada vazia', () => {
    it.each([
      ['', 'string vazia'],
      ['   ', 'apenas espaços'],
      ['abc', 'sem dígitos'],
    ])('rejeita %s (%s)', (input) => {
      expect(() => Document.create(input)).toThrow('CPF/CNPJ inválido');
    });

    it('rejeita valor nulo vindo de fora do TypeScript', () => {
      expect(() => Document.create(null as unknown as string)).toThrow(
        DomainException,
      );
    });
  });

  describe('igualdade por valor', () => {
    it('considera iguais dois documentos com o mesmo valor', () => {
      expect(
        Document.create('529.982.247-25').equals(Document.create(VALID_CPF)),
      ).toBe(true);
    });

    it('considera diferentes dois documentos distintos', () => {
      expect(
        Document.create(VALID_CPF).equals(Document.create(VALID_CNPJ)),
      ).toBe(false);
    });
  });

  it('expõe o valor em toString', () => {
    expect(String(Document.create(VALID_CPF))).toBe(VALID_CPF);
  });
});
