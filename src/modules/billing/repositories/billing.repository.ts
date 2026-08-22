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
      include: { payments: true },
    });

    return BillingMapper.toDomain(created);
  }

  async findById(id: string): Promise<Billing | null> {
    const record = await this.prisma.billing.findUnique({
      where: { id },
      include: { payments: true },
    });

    return record ? BillingMapper.toDomain(record) : null;
  }

  async findByServiceOrderId(serviceOrderId: string): Promise<Billing | null> {
    const record = await this.prisma.billing.findUnique({
      where: { serviceOrderId },
      include: { payments: true },
    });

    return record ? BillingMapper.toDomain(record) : null;
  }

  async findAll(): Promise<Billing[]> {
    const records = await this.prisma.billing.findMany({
      include: { payments: true },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((record) => BillingMapper.toDomain(record));
  }

  async update(billing: Billing): Promise<Billing> {
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.billing.update({
        where: { id: billing.getId() },
        data: {
          status: billing.getStatus(),
          totalCents: billing.getTotalAmountInCents(),
          paidCents: billing.getPaidAmountInCents(),
          balanceCents: billing.getBalanceAmountInCents(),
          updatedAt: billing.getUpdatedAt(),
        },
      });

      await tx.billingPayment.deleteMany({
        where: { billingId: billing.getId() },
      });

      await tx.billingPayment.createMany({
        data: billing.getPayments().map((payment) => ({
          id: payment.getId(),
          billingId: billing.getId(),
          amountCents: payment.getAmount().valueInCents,
          method: payment.getMethod(),
          paidAt: payment.getPaidAt(),
          createdAt: payment.getCreatedAt(),
        })),
      });

      return tx.billing.findUnique({
        where: { id: billing.getId() },
        include: { payments: true },
      });
    });

    return BillingMapper.toDomain(updated!);
  }
}
