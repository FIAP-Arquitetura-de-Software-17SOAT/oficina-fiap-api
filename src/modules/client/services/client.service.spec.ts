import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DomainException } from '../../../shared/domain/domain.exception';
import { Client } from '../entities/client.entity';
import { ClientRepository } from '../repositories/client.repository';
import { ClientService } from './client.service';

const VALID_CPF = '52998224725';

const makeClient = (
  overrides: Partial<Parameters<typeof Client.create>[0]> = {},
) =>
  Client.create({
    name: 'Maria Silva',
    document: VALID_CPF,
    email: 'maria@example.com',
    phone: '11999998888',
    ...overrides,
  });

type MockedRepository = {
  [K in keyof ClientRepository]: jest.Mock;
};

describe('ClientService', () => {
  let service: ClientService;
  let repository: MockedRepository;

  beforeEach(async () => {
    repository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByDocument: jest.fn(),
      findByEmail: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientService,
        { provide: ClientRepository, useValue: repository },
      ],
    }).compile();

    service = module.get<ClientService>(ClientService);
  });

  describe('create', () => {
    const dto = {
      name: 'Maria Silva',
      document: '529.982.247-25',
      email: 'Maria@Example.com',
      phone: '(11) 99999-8888',
    };

    it('persiste o cliente quando documento e e-mail estão livres', async () => {
      repository.findByDocument.mockResolvedValue(null);
      repository.findByEmail.mockResolvedValue(null);
      repository.create.mockImplementation((client: Client) => client);

      const created = await service.create(dto);

      expect(created.getDocument().getValue()).toBe(VALID_CPF);
      expect(created.getEmail().getValue()).toBe('maria@example.com');
      expect(repository.create).toHaveBeenCalledTimes(1);
    });

    it('consulta o documento já normalizado, sem máscara', async () => {
      repository.findByDocument.mockResolvedValue(null);
      repository.findByEmail.mockResolvedValue(null);
      repository.create.mockImplementation((client: Client) => client);

      await service.create(dto);

      expect(repository.findByDocument).toHaveBeenCalledWith(VALID_CPF);
      expect(repository.findByEmail).toHaveBeenCalledWith('maria@example.com');
    });

    it('recusa documento já cadastrado', async () => {
      repository.findByDocument.mockResolvedValue(makeClient());

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('recusa e-mail já em uso', async () => {
      repository.findByDocument.mockResolvedValue(null);
      repository.findByEmail.mockResolvedValue(makeClient());

      await expect(service.create(dto)).rejects.toThrow(
        'E-mail already in use',
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('recusa documento inválido antes de tocar no banco', async () => {
      await expect(
        service.create({ ...dto, document: '12345678900' }),
      ).rejects.toThrow(DomainException);

      expect(repository.findByDocument).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('retorna o cliente encontrado', async () => {
      const client = makeClient();
      repository.findById.mockResolvedValue(client);

      await expect(service.findById(client.getId())).resolves.toBe(client);
    });

    it('lança NotFound quando não existe', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findById('id-inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('delega para o repositório', async () => {
      const clients = [makeClient()];
      repository.findAll.mockResolvedValue(clients);

      await expect(service.findAll()).resolves.toBe(clients);
    });
  });

  describe('update', () => {
    it('aplica apenas os campos enviados', async () => {
      const client = makeClient();
      repository.findById.mockResolvedValue(client);
      repository.findByEmail.mockResolvedValue(null);
      repository.update.mockImplementation((c: Client) => c);

      const updated = await service.update(client.getId(), {
        name: 'Maria Souza',
      });

      expect(updated.getName()).toBe('Maria Souza');
      expect(updated.getEmail().getValue()).toBe('maria@example.com');
      expect(updated.getPhone()).toBe('11999998888');
    });

    it('permite manter o próprio e-mail', async () => {
      const client = makeClient();
      repository.findById.mockResolvedValue(client);
      repository.findByEmail.mockResolvedValue(client);
      repository.update.mockImplementation((c: Client) => c);

      await expect(
        service.update(client.getId(), { email: 'maria@example.com' }),
      ).resolves.toBeDefined();
    });

    it('recusa e-mail que pertence a outro cliente', async () => {
      const client = makeClient();
      const outro = makeClient({ email: 'joao@example.com' });
      repository.findById.mockResolvedValue(client);
      repository.findByEmail.mockResolvedValue(outro);

      await expect(
        service.update(client.getId(), { email: 'joao@example.com' }),
      ).rejects.toThrow(ConflictException);

      expect(repository.update).not.toHaveBeenCalled();
    });

    it('lança NotFound quando o cliente não existe', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.update('id-inexistente', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('propaga erro de domínio em telefone inválido', async () => {
      const client = makeClient();
      repository.findById.mockResolvedValue(client);

      await expect(
        service.update(client.getId(), { phone: '123' }),
      ).rejects.toThrow(DomainException);

      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('remove um cliente existente', async () => {
      const client = makeClient();
      repository.findById.mockResolvedValue(client);

      await service.delete(client.getId());

      expect(repository.delete).toHaveBeenCalledWith(client.getId());
    });

    it('lança NotFound e não remove quando o cliente não existe', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.delete('id-inexistente')).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.delete).not.toHaveBeenCalled();
    });
  });
});
