import { Injectable } from '@nestjs/common';
import { isUniqueViolation } from '../../../../shared/database/prisma-errors';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { BillingApplicationError } from '../../application/errors/billing-application.error';
import { BillingRepositoryPort } from '../../application/ports/billing-repository.port';
import { Billing } from '../../domain/entities/billing.entity';
import { PaymentMethod } from '../../domain/enums/payment-method.enum';
import { BillingPersistenceMapper } from './billing-persistence.mapper';

@Injectable()
export class PrismaBillingRepository implements BillingRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async create(billing: Billing): Promise<Billing> {
    try {
      const created = await this.prisma.billing.create({
        data: BillingPersistenceMapper.toPersistence(billing),
      });
      return BillingPersistenceMapper.toDomain(created);
    } catch (error) {
      // Duas requisições cobrando a mesma OS: o banco decide, e a segunda vê
      // o mesmo conflito da pré-checagem.
      if (isUniqueViolation(error)) {
        throw new BillingApplicationError('BILLING_ALREADY_EXISTS');
      }
      throw error;
    }
  }

  async findById(id: string): Promise<Billing | null> {
    const record = await this.prisma.billing.findUnique({ where: { id } });
    return record ? BillingPersistenceMapper.toDomain(record) : null;
  }

  async findByServiceOrderId(serviceOrderId: string): Promise<Billing | null> {
    const record = await this.prisma.billing.findUnique({
      where: { serviceOrderId },
    });
    return record ? BillingPersistenceMapper.toDomain(record) : null;
  }

  async findByGatewayTransactionId(
    gatewayTransactionId: string,
  ): Promise<Billing | null> {
    const checkoutSession = await this.prisma.billingCheckoutSession.findUnique(
      {
        where: { gatewayTransactionId },
        include: { billing: true },
      },
    );
    return checkoutSession
      ? BillingPersistenceMapper.toDomain(checkoutSession.billing)
      : null;
  }

  async findAll(): Promise<Billing[]> {
    const records = await this.prisma.billing.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return records.map((record) => BillingPersistenceMapper.toDomain(record));
  }

  async registerCheckoutSession(
    billingId: string,
    gatewayTransactionId: string,
  ): Promise<void> {
    await this.prisma.billingCheckoutSession.upsert({
      where: { gatewayTransactionId },
      update: {},
      create: { billingId, gatewayTransactionId },
    });
  }

  async recordCheckoutSessionPayment(
    gatewayTransactionId: string,
    paymentMethod: PaymentMethod,
    paidAt: Date,
  ): Promise<void> {
    await this.prisma.billingCheckoutSession.updateMany({
      where: { gatewayTransactionId, paidAt: null },
      data: { paymentMethod, paidAt },
    });
  }

  async update(
    billing: Billing,
    expectedUpdatedAt: Date,
  ): Promise<Billing | null> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.billing.updateMany({
        where: { id: billing.getId(), updatedAt: expectedUpdatedAt },
        data: BillingPersistenceMapper.toUpdate(billing),
      });
      if (result.count === 0) return null;

      return tx.billing.findUnique({ where: { id: billing.getId() } });
    });

    return updated ? BillingPersistenceMapper.toDomain(updated) : null;
  }
}
