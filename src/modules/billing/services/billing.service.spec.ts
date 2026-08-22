import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  Budget,
  BudgetItemType,
  BudgetStatus,
} from '../../budget/entities/budget.entity';
import { BudgetService } from '../../budget/services/budget.service';
import { ServiceOrder } from '../../service-order/entities/service-order.entity';
import { ServiceOrderStatus } from '../../service-order/enums/service-order-status.enum';
import { ServiceOrderService } from '../../service-order/services/service-order.service';
import { Billing } from '../entities/billing.entity';
import { PaymentMethod } from '../enums/payment-method.enum';
import { BillingRepository } from '../repositories/billing.repository';
import { PaymentAmount } from '../value-objects/payment-amount.vo';
import { BillingService } from './billing.service';

const serviceOrderId = 'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c';

const completedServiceOrder = () =>
  ServiceOrder.restore(serviceOrderId, {
    clientId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
    vehicleId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
    description: 'Troca de oleo',
    status: ServiceOrderStatus.COMPLETED,
    completedAt: new Date('2026-08-20T10:00:00.000Z'),
  });

const acceptedBudget = (version: number, total: number) =>
  Budget.restore(`0000000${version}-1c2e-4f5a-8b9c-0d1e2f3a4b5c`, {
    serviceOrderId,
    version,
    status: BudgetStatus.ACCEPTED,
    items: [
      {
        id: `1000000${version}-1c2e-4f5a-8b9c-0d1e2f3a4b5c`,
        description: 'Servico',
        type: BudgetItemType.SERVICE,
        quantity: 1,
        unitPrice: total,
      },
    ],
  });

describe('BillingService', () => {
  let repository: jest.Mocked<BillingRepository>;
  let budgetService: jest.Mocked<BudgetService>;
  let serviceOrderService: jest.Mocked<ServiceOrderService>;
  let service: BillingService;

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByServiceOrderId: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<BillingRepository>;
    budgetService = {
      findByServiceOrderId: jest.fn(),
    } as unknown as jest.Mocked<BudgetService>;
    serviceOrderService = {
      findById: jest.fn(),
      deliver: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderService>;
    service = new BillingService(repository, budgetService, serviceOrderService);
  });

  it('generates billing from latest accepted budget for completed service order', async () => {
    serviceOrderService.findById.mockResolvedValue(completedServiceOrder());
    budgetService.findByServiceOrderId.mockResolvedValue([
      acceptedBudget(1, 100),
      acceptedBudget(2, 150),
    ]);
    repository.findByServiceOrderId.mockResolvedValue(null);
    repository.create.mockImplementation(async (billing) => billing);

    const billing = await service.generateForServiceOrder({ serviceOrderId });

    expect(billing.getTotalAmountInCents()).toBe(15000);
    expect(repository.create).toHaveBeenCalledWith(billing);
  });

  it('rejects billing generation when service order is not completed', async () => {
    serviceOrderService.findById.mockResolvedValue(
      ServiceOrder.restore(serviceOrderId, {
        clientId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        vehicleId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        description: 'Troca de oleo',
        status: ServiceOrderStatus.IN_PROGRESS,
      }),
    );

    await expect(
      service.generateForServiceOrder({ serviceOrderId }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects duplicate billing for service order', async () => {
    serviceOrderService.findById.mockResolvedValue(completedServiceOrder());
    repository.findByServiceOrderId.mockResolvedValue(
      Billing.create({ serviceOrderId, totalAmountInCents: 10000 }),
    );

    await expect(
      service.generateForServiceOrder({ serviceOrderId }),
    ).rejects.toThrow('Billing already exists for service order');
  });

  it('translates a concurrent billing unique violation to a conflict', async () => {
    serviceOrderService.findById.mockResolvedValue(completedServiceOrder());
    budgetService.findByServiceOrderId.mockResolvedValue([
      acceptedBudget(1, 150),
    ]);
    repository.findByServiceOrderId.mockResolvedValue(null);
    repository.create.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
        meta: { target: ['serviceOrderId'] },
      }),
    );

    await expect(
      service.generateForServiceOrder({ serviceOrderId }),
    ).rejects.toThrow(
      new ConflictException('Billing already exists for service order'),
    );
  });

  it('registers payment and persists billing', async () => {
    const billing = Billing.create({
      serviceOrderId,
      totalAmountInCents: 15000,
    });
    repository.findById.mockResolvedValue(billing);
    repository.update.mockImplementation(async (updated) => updated);

    const updated = await service.registerPayment(billing.getId(), {
      amount: 150,
      method: PaymentMethod.PIX,
    });

    expect(updated.getBalanceAmountInCents()).toBe(0);
    expect(repository.update).toHaveBeenCalledWith(
      updated,
      expect.any(Date),
    );
  });

  it('rejects payment registration when the billing was changed concurrently', async () => {
    const billing = Billing.create({
      serviceOrderId,
      totalAmountInCents: 15000,
    });
    repository.findById.mockResolvedValue(billing);
    repository.update.mockResolvedValue(null);

    await expect(
      service.registerPayment(billing.getId(), {
        amount: 150,
        method: PaymentMethod.PIX,
      }),
    ).rejects.toThrow('Billing was changed by another request');
  });

  it('rejects cancellation when the billing was changed concurrently', async () => {
    const billing = Billing.create({
      serviceOrderId,
      totalAmountInCents: 15000,
    });
    repository.findById.mockResolvedValue(billing);
    repository.update.mockResolvedValue(null);

    await expect(service.cancel(billing.getId())).rejects.toThrow(
      'Billing was changed by another request',
    );
  });

  it('delivers service order only when billing is paid', async () => {
    const billing = Billing.create({
      serviceOrderId,
      totalAmountInCents: 15000,
    });
    billing.registerPayment({
      amount: PaymentAmount.fromCents(15000),
      method: PaymentMethod.CASH,
    });
    repository.findById.mockResolvedValue(billing);
    serviceOrderService.deliver.mockResolvedValue(completedServiceOrder());

    await service.deliverServiceOrder(billing.getId());

    expect(serviceOrderService.deliver).toHaveBeenCalledWith(serviceOrderId);
  });

  it('rejects delivery when billing is not paid', async () => {
    const billing = Billing.create({
      serviceOrderId,
      totalAmountInCents: 15000,
    });
    repository.findById.mockResolvedValue(billing);

    await expect(service.deliverServiceOrder(billing.getId())).rejects.toThrow(
      'Billing must be paid before delivery',
    );
  });

  it('throws not found when billing id does not exist', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(service.findById(serviceOrderId)).rejects.toThrow(
      NotFoundException,
    );
  });
});
