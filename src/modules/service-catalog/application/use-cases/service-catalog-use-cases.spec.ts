import { Money } from '../../../../shared/domain/value-objects/money.vo';
import { Service } from '../../domain/entities/service.entity';
import { ServiceCatalogApplicationError } from '../errors/service-catalog-application.error';
import { ServiceRepositoryPort } from '../ports/service-repository.port';
import { CreateServiceUseCase } from './create-service.use-case';
import { DeleteServiceUseCase } from './delete-service.use-case';
import { FindServiceUseCase } from './find-service.use-case';
import { ListServicesUseCase } from './list-services.use-case';
import { UpdateServiceUseCase } from './update-service.use-case';

const makeService = (name = 'Troca de óleo', price = 149.9) =>
  Service.create({ name, price: Money.fromDecimal(price) });

type MockedRepository = { [K in keyof ServiceRepositoryPort]: jest.Mock };

describe('Service catalog use cases without Nest', () => {
  let repository: MockedRepository;
  let catalog: {
    create: CreateServiceUseCase['execute'];
    findById: FindServiceUseCase['execute'];
    findAll: ListServicesUseCase['execute'];
    update: UpdateServiceUseCase['execute'];
    delete: DeleteServiceUseCase['execute'];
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
    catalog = {
      create: (i) => new CreateServiceUseCase(repository).execute(i),
      findById: (id) => new FindServiceUseCase(repository).execute(id),
      findAll: () => new ListServicesUseCase(repository).execute(),
      update: (id, i) => new UpdateServiceUseCase(repository).execute(id, i),
      delete: (id) => new DeleteServiceUseCase(repository).execute(id),
    };
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

    it('recusa nome já usado com a mensagem de negócio', async () => {
      repository.findByName.mockResolvedValue(makeService());

      await expect(
        catalog.create({ name: 'Troca de óleo', price: 149.9 }),
      ).rejects.toMatchObject({
        code: 'SERVICE_NAME_IN_USE',
        kind: 'CONFLICT',
        message: 'Já existe um serviço com esse nome',
      });
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

    it('SERVICE_NOT_FOUND quando não existe', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(catalog.findById('missing')).rejects.toMatchObject({
        code: 'SERVICE_NOT_FOUND',
        kind: 'NOT_FOUND',
        message: 'Serviço não encontrado',
      });
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
      ).rejects.toThrow(ServiceCatalogApplicationError);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('SERVICE_NOT_FOUND quando o serviço não existe', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        catalog.update('missing', { price: 10 }),
      ).rejects.toMatchObject({ code: 'SERVICE_NOT_FOUND' });
    });
  });

  describe('delete', () => {
    it('remove o serviço existente', async () => {
      const service = makeService();
      repository.findById.mockResolvedValue(service);

      await catalog.delete(service.getId());

      expect(repository.delete).toHaveBeenCalledWith(service.getId());
    });

    it('SERVICE_NOT_FOUND quando o serviço não existe', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(catalog.delete('missing')).rejects.toMatchObject({
        code: 'SERVICE_NOT_FOUND',
      });
      expect(repository.delete).not.toHaveBeenCalled();
    });
  });
});
