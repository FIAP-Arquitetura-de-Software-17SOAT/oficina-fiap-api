import { ConflictException, NotFoundException } from '@nestjs/common';
import { Service } from '../entities/service.entity';
import { ServiceRepository } from '../repositories/service.repository';
import { ServiceCatalogService } from './service-catalog.service';

const makeService = (name = 'Troca de óleo', price = 149.9) =>
  Service.create({ name, price });

describe('ServiceCatalogService', () => {
  let catalog: ServiceCatalogService;
  let repository: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    findByName: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(() => {
    repository = {
      create: jest.fn((service: Service) => Promise.resolve(service)),
      findAll: jest.fn(),
      findById: jest.fn(),
      findByName: jest.fn().mockResolvedValue(null),
      update: jest.fn((service: Service) => Promise.resolve(service)),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    catalog = new ServiceCatalogService(
      repository as unknown as ServiceRepository,
    );
  });

  describe('create', () => {
    it('cadastra quando o nome está livre', async () => {
      const created = await catalog.create({
        name: 'Troca de óleo',
        description: 'Sintético',
        price: 149.9,
      });

      expect(created.getName()).toBe('Troca de óleo');
      expect(created.getPrice().valueInCents).toBe(14990);
      expect(repository.create).toHaveBeenCalledTimes(1);
    });

    it('recusa nome já usado', async () => {
      repository.findByName.mockResolvedValue(makeService());

      await expect(
        catalog.create({ name: 'Troca de óleo', price: 149.9 }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('consulta o nome já normalizado', async () => {
      await catalog.create({ name: '  Alinhamento  ', price: 80 });

      expect(repository.findByName).toHaveBeenCalledWith('Alinhamento');
    });
  });

  describe('findById', () => {
    it('devolve o serviço encontrado', async () => {
      const service = makeService();
      repository.findById.mockResolvedValue(service);

      await expect(catalog.findById(service.getId())).resolves.toBe(service);
    });

    it('404 quando não existe', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(catalog.findById('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it('findAll delega ao repositório', async () => {
    const services = [makeService()];
    repository.findAll.mockResolvedValue(services);

    await expect(catalog.findAll()).resolves.toBe(services);
  });

  describe('update', () => {
    it('altera os campos informados', async () => {
      const service = makeService();
      repository.findById.mockResolvedValue(service);

      const updated = await catalog.update(service.getId(), {
        name: 'Troca de óleo e filtro',
        description: 'Inclui filtro',
        price: 189.9,
      });

      expect(updated.getName()).toBe('Troca de óleo e filtro');
      expect(updated.getDescription()).toBe('Inclui filtro');
      expect(updated.getPrice().valueInCents).toBe(18990);
      expect(repository.update).toHaveBeenCalledWith(service);
    });

    it('não altera nada quando o corpo vem vazio', async () => {
      const service = makeService();
      repository.findById.mockResolvedValue(service);

      const updated = await catalog.update(service.getId(), {});

      expect(updated.getName()).toBe('Troca de óleo');
      expect(updated.getPrice().valueInCents).toBe(14990);
    });

    it('permite manter o próprio nome', async () => {
      const service = makeService();
      repository.findById.mockResolvedValue(service);
      repository.findByName.mockResolvedValue(service);

      await expect(
        catalog.update(service.getId(), { name: 'Troca de óleo' }),
      ).resolves.toBe(service);
    });

    it('recusa nome de outro serviço', async () => {
      const service = makeService();
      repository.findById.mockResolvedValue(service);
      repository.findByName.mockResolvedValue(makeService('Alinhamento', 80));

      await expect(
        catalog.update(service.getId(), { name: 'Alinhamento' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('404 quando o serviço não existe', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        catalog.update('missing', { price: 10 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('delete', () => {
    it('remove o serviço existente', async () => {
      const service = makeService();
      repository.findById.mockResolvedValue(service);

      await catalog.delete(service.getId());

      expect(repository.delete).toHaveBeenCalledWith(service.getId());
    });

    it('404 quando o serviço não existe', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(catalog.delete('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repository.delete).not.toHaveBeenCalled();
    });
  });
});
