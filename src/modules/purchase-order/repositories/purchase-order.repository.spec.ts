import { ConflictException } from '@nestjs/common';

import { PrismaService } from '../../../shared/database/prisma.service';

import { PurchaseOrder } from '../entities/purchase-order.entity';
import { PurchaseOrderStatus } from '../enums/purchase-order-status.enum';
import { PurchaseOrderNumber } from '../value-objects/purchase-order-number.vo';

import { PurchaseOrderRepository } from './purchase-order.repository';

const row = {
  id: 'e5c3d2a1-6f7b-4a8c-9d0e-1f2a3b4c5d6e',
  number: 'PC-2026-0042',
  supplier: 'Auto Pecas Silva',
  status: PurchaseOrderStatus.NEEDS_PURCHASE,
  createdAt: new Date('2026-01-01T10:00:00.000Z'),
  updatedAt: new Date('2026-01-01T10:00:00.000Z'),
  deliveredAt: null,
  items: [],
};

const makePurchaseOrder = () =>
  new PurchaseOrder({
    number: PurchaseOrderNumber.create(row.number),
    supplier: row.supplier,
  });

describe('PurchaseOrderRepository', () => {
  let repository: PurchaseOrderRepository;
  let prisma: {
    purchaseOrder: {
      create: jest.Mock;
      count: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      purchaseOrder: {
        create: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    repository = new PurchaseOrderRepository(
      prisma as unknown as PrismaService,
    );
  });

  it('traduz P2002 no numero do pedido em conflito, e nao em 500', async () => {
    prisma.purchaseOrder.create.mockRejectedValue({
      code: 'P2002',
      meta: { target: ['number'] },
    });

    await expect(repository.create(makePurchaseOrder())).rejects.toThrow(
      ConflictException,
    );
  });

  it('propaga qualquer outro erro do banco no create', async () => {
    prisma.purchaseOrder.create.mockRejectedValue(new Error('conexao caiu'));

    await expect(repository.create(makePurchaseOrder())).rejects.toThrow(
      'conexao caiu',
    );
  });

  it('reconstroi a entidade a partir da linha do banco', async () => {
    prisma.purchaseOrder.create.mockResolvedValue(row);

    const purchaseOrder = await repository.create(makePurchaseOrder());

    expect(purchaseOrder.getId()).toBe(row.id);
    expect(purchaseOrder.getNumber().value).toBe(row.number);
    expect(purchaseOrder.getCreatedAt()).toEqual(row.createdAt);
  });
});
