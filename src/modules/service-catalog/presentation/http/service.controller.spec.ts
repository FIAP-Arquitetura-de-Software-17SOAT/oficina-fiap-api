import { Test, TestingModule } from '@nestjs/testing';
import { Money } from '../../../../shared/domain/value-objects/money.vo';
import { Service } from '../../domain/entities/service.entity';
import { CreateServiceUseCase } from '../../application/use-cases/create-service.use-case';
import { FindServiceUseCase } from '../../application/use-cases/find-service.use-case';
import { ListServicesUseCase } from '../../application/use-cases/list-services.use-case';
import { UpdateServiceUseCase } from '../../application/use-cases/update-service.use-case';
import { DeleteServiceUseCase } from '../../application/use-cases/delete-service.use-case';
import { ServiceController } from './service.controller';

const makeService = () =>
  Service.create({
    name: 'Troca de óleo',
    description: 'Sintético',
    price: Money.fromDecimal(149.9),
  });

describe('ServiceController', () => {
  let controller: ServiceController;
  let catalog: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    catalog = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ServiceController],
      providers: [
        {
          provide: CreateServiceUseCase,
          useValue: { execute: catalog.create },
        },
        {
          provide: FindServiceUseCase,
          useValue: { execute: catalog.findById },
        },
        {
          provide: ListServicesUseCase,
          useValue: { execute: catalog.findAll },
        },
        {
          provide: UpdateServiceUseCase,
          useValue: { execute: catalog.update },
        },
        {
          provide: DeleteServiceUseCase,
          useValue: { execute: catalog.delete },
        },
      ],
    }).compile();

    controller = module.get<ServiceController>(ServiceController);
  });

  it('cadastra devolvendo o DTO mapeado', async () => {
    const service = makeService();
    catalog.create.mockResolvedValue(service);

    await expect(
      controller.create({ name: 'Troca de óleo', price: 149.9 }),
    ).resolves.toMatchObject({
      id: service.getId(),
      name: 'Troca de óleo',
      description: 'Sintético',
      price: 149.9,
    });
  });

  it('lista devolvendo DTOs', async () => {
    catalog.findAll.mockResolvedValue([makeService()]);

    const response = await controller.findAll();

    expect(response).toHaveLength(1);
    expect(response[0].price).toBe(149.9);
  });

  it('busca por id', async () => {
    const service = makeService();
    catalog.findById.mockResolvedValue(service);

    await expect(controller.findById(service.getId())).resolves.toMatchObject({
      id: service.getId(),
    });
  });

  it('atualiza repassando o dto', async () => {
    const service = makeService();
    catalog.update.mockResolvedValue(service);

    await controller.update(service.getId(), { price: 189.9 });

    expect(catalog.update).toHaveBeenCalledWith(service.getId(), {
      price: 189.9,
    });
  });

  it('remove sem devolver corpo', async () => {
    catalog.delete.mockResolvedValue(undefined);

    await expect(controller.delete('service-1')).resolves.toBeUndefined();
    expect(catalog.delete).toHaveBeenCalledWith('service-1');
  });
});
