import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { Billing } from '../entities/billing.entity';
import { BillingMapper } from '../mappers/billing.mapper';

@Injectable()
export class BillingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(billing: Billing): Promise<Billing> {
    const created = await this.prisma.billing.create({
      data: BillingMapper.toPersistence(billing),
    });

    return BillingMapper.toDomain(created);
  }

  async findById(id: string): Promise<Billing | null> {
    const record = await this.prisma.billing.findUnique({
      where: { id },
    });

    return record ? BillingMapper.toDomain(record) : null;
  }

  async findByServiceOrderId(serviceOrderId: string): Promise<Billing | null> {
    const record = await this.prisma.billing.findUnique({
      where: { serviceOrderId },
    });

    return record ? BillingMapper.toDomain(record) : null;
  }

  async findByGatewayTransactionId(
    gatewayTransactionId: string,
  ): Promise<Billing | null> {
    const checkoutSession = await this.prisma.billingCheckoutSession.findUnique({
      where: { gatewayTransactionId },
      include: { billing: true },
    });

    return checkoutSession ? BillingMapper.toDomain(checkoutSession.billing) : null;
  }

  async findAll(): Promise<Billing[]> {
    const records = await this.prisma.billing.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return records.map((record) => BillingMapper.toDomain(record));
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

  async update(
    billing: Billing,
    expectedUpdatedAt: Date,
  ): Promise<Billing | null> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.billing.updateMany({
        where: { id: billing.getId(), updatedAt: expectedUpdatedAt },
        data: {
          status: billing.getStatus(),
          amountCents: billing.getAmount().valueInCents,
          paymentLink: billing.getPaymentLink(),
          gatewayTransactionId: billing.getGatewayTransactionId(),
          paymentMethod: billing.getPaymentMethod(),
          generatedAt: billing.getGeneratedAt(),
          paidAt: billing.getPaidAt(),
          expiresAt: billing.getExpiresAt(),
          updatedAt: billing.getUpdatedAt(),
        },
      });

      if (result.count === 0) {
        return null;
      }

      return tx.billing.findUnique({
        where: { id: billing.getId() },
      });
    });

    return updated ? BillingMapper.toDomain(updated) : null;
  }
}
