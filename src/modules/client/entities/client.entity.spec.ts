import { DomainException } from '../../../shared/domain/domain.exception';
import { Client, ClientProps } from './client.entity';

const VALID_CPF = '52998224725';

const validProps = (overrides: Partial<ClientProps> = {}): ClientProps => ({
  name: 'Maria Silva',
  document: VALID_CPF,
  email: 'maria@example.com',
  phone: '11999998888',
  ...overrides,
});

describe('Client', () => {
  describe('create', () => {
    it('gera um id novo', () => {
      const client = Client.create(validProps());

      expect(client.getId()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('expõe documento e e-mail como Value Objects', () => {
      const client = Client.create(validProps());

      expect(client.getDocument().getValue()).toBe(VALID_CPF);
      expect(client.getEmail().getValue()).toBe('maria@example.com');
    });

    it('normaliza os dados na construção', () => {
      const client = Client.create(
        validProps({
          name: '  Maria Silva  ',
          document: '529.982.247-25',
          email: 'MARIA@example.com',
          phone: '(11) 99999-8888',
        }),
      );

      expect(client.getName()).toBe('Maria Silva');
      expect(client.getDocument().getValue()).toBe(VALID_CPF);
      expect(client.getEmail().getValue()).toBe('maria@example.com');
      expect(client.getPhone()).toBe('11999998888');
    });

    it('define createdAt e updatedAt quando não informados', () => {
      const client = Client.create(validProps());

      expect(client.getCreatedAt()).toBeInstanceOf(Date);
      expect(client.getUpdatedAt()).toBeInstanceOf(Date);
    });
  });

  describe('invariantes', () => {
    it.each([
      ['nome vazio', { name: '   ' }, 'Nome do cliente é obrigatório'],
      ['documento inválido', { document: '12345678900' }, 'CPF/CNPJ inválido'],
      ['e-mail inválido', { email: 'nao-e-email' }, 'E-mail inválido'],
      [
        'telefone curto',
        { phone: '119999' },
        'Telefone deve ter DDD e 8 ou 9 dígitos',
      ],
      [
        'telefone longo',
        { phone: '119999988887' },
        'Telefone deve ter DDD e 8 ou 9 dígitos',
      ],
    ])('recusa cliente com %s', (_label, overrides, message) => {
      expect(() => Client.create(validProps(overrides))).toThrow(message);
    });

    it('lança DomainException e não Error genérico', () => {
      expect(() => Client.create(validProps({ email: 'x' }))).toThrow(
        DomainException,
      );
    });

    it.each([['name'], ['phone']])(
      'recusa %s nulo vindo de fora do TypeScript',
      (field) => {
        expect(() =>
          Client.create(validProps({ [field]: null as unknown as string })),
        ).toThrow(DomainException);
      },
    );

    it('aceita telefone fixo de 10 dígitos', () => {
      expect(
        Client.create(validProps({ phone: '1133334444' })).getPhone(),
      ).toBe('1133334444');
    });
  });

  describe('restore', () => {
    it('preserva o id e as datas vindas do banco', () => {
      const createdAt = new Date('2026-01-01T10:00:00.000Z');
      const updatedAt = new Date('2026-02-01T10:00:00.000Z');

      const client = Client.restore(
        'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        validProps({ createdAt, updatedAt }),
      );

      expect(client.getId()).toBe('f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c');
      expect(client.getCreatedAt()).toBe(createdAt);
      expect(client.getUpdatedAt()).toBe(updatedAt);
    });
  });

  describe('alterações', () => {
    const oldDate = new Date('2020-01-01T00:00:00.000Z');

    const restored = () =>
      Client.restore(
        'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        validProps({ createdAt: oldDate, updatedAt: oldDate }),
      );

    it('changeName atualiza o nome e toca updatedAt', () => {
      const client = restored();

      client.changeName('Maria Souza');

      expect(client.getName()).toBe('Maria Souza');
      expect(client.getUpdatedAt().getTime()).toBeGreaterThan(
        oldDate.getTime(),
      );
    });

    it('changeEmail normaliza o novo e-mail', () => {
      const client = restored();

      client.changeEmail('NOVA@Example.com');

      expect(client.getEmail().getValue()).toBe('nova@example.com');
    });

    it('changePhone normaliza o novo telefone', () => {
      const client = restored();

      client.changePhone('(21) 98888-7777');

      expect(client.getPhone()).toBe('21988887777');
    });

    it.each([
      ['changeName', (c: Client) => c.changeName('')],
      ['changeEmail', (c: Client) => c.changeEmail('invalido')],
      ['changePhone', (c: Client) => c.changePhone('123')],
    ])('%s recusa valor inválido e mantém o estado anterior', (_label, act) => {
      const client = restored();

      expect(() => act(client)).toThrow(DomainException);
      expect(client.getName()).toBe('Maria Silva');
      expect(client.getEmail().getValue()).toBe('maria@example.com');
      expect(client.getPhone()).toBe('11999998888');
      expect(client.getUpdatedAt()).toBe(oldDate);
    });

    it('não expõe forma de trocar o documento', () => {
      const client = restored() as unknown as Record<string, unknown>;

      expect(client.changeDocument).toBeUndefined();
    });
  });
});
