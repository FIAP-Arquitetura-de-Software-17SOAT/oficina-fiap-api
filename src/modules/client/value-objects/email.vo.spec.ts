import { DomainException } from '../../../shared/domain/domain.exception';
import { Email } from './email.vo';

describe('Email', () => {
  it('aceita um e-mail válido', () => {
    expect(Email.create('maria@example.com').getValue()).toBe(
      'maria@example.com',
    );
  });

  it('normaliza para minúsculas para não duplicar cliente na coluna única', () => {
    expect(Email.create('Maria@Example.COM').getValue()).toBe(
      'maria@example.com',
    );
  });

  it('remove espaços das pontas', () => {
    expect(Email.create('  maria@example.com  ').getValue()).toBe(
      'maria@example.com',
    );
  });

  it.each([
    ['maria', 'sem arroba'],
    ['@example.com', 'sem parte local'],
    ['maria@', 'sem domínio'],
    ['maria@example', 'sem TLD'],
    ['maria @example.com', 'com espaço no meio'],
    ['@', 'apenas arroba'],
    ['', 'string vazia'],
  ])('rejeita "%s" (%s)', (input) => {
    expect(() => Email.create(input)).toThrow(DomainException);
  });

  it('rejeita valor nulo vindo de fora do TypeScript', () => {
    expect(() => Email.create(null as unknown as string)).toThrow(
      'E-mail inválido',
    );
  });

  describe('igualdade por valor', () => {
    it('considera iguais e-mails que só diferem no caixa', () => {
      expect(
        Email.create('MARIA@example.com').equals(
          Email.create('maria@example.com'),
        ),
      ).toBe(true);
    });

    it('considera diferentes e-mails distintos', () => {
      expect(
        Email.create('maria@example.com').equals(
          Email.create('joao@example.com'),
        ),
      ).toBe(false);
    });
  });

  it('expõe o valor em toString', () => {
    expect(String(Email.create('maria@example.com'))).toBe('maria@example.com');
  });
});
