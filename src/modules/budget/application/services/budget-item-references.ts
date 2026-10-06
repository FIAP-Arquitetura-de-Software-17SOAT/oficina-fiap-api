import { Money } from '../../../../shared/domain/value-objects/money.vo';
import { BudgetItemProps } from '../../domain/entities/budget.entity';
import { CreateBudgetItemInput } from '../contracts/budget.input';
import { BudgetApplicationError } from '../errors/budget-application.error';
import { PartCatalogPort } from '../ports/part-catalog.port';
import { ServiceCatalogPort } from '../ports/service-catalog.port';

/**
 * O item guarda o preço como cópia, mas `serviceId` e `partId` precisam
 * apontar para algo que exista de verdade — senão o orçamento vira referência
 * quebrada e o erro só apareceria como violação de chave estrangeira, em 500.
 */
export class BudgetItemReferences {
  constructor(
    private readonly services: ServiceCatalogPort,
    private readonly parts: PartCatalogPort,
  ) {}

  async assertExist(items: CreateBudgetItemInput[] = []): Promise<void> {
    for (const serviceId of distinctRefs(items, (item) => item.serviceId)) {
      if (!(await this.services.exists(serviceId))) {
        throw new BudgetApplicationError('SERVICE_NOT_FOUND');
      }
    }
    for (const partId of distinctRefs(items, (item) => item.partId)) {
      if (!(await this.parts.exists(partId))) {
        throw new BudgetApplicationError('PART_NOT_FOUND');
      }
    }
  }

  /**
   * Fronteira entre o contrato HTTP e o domínio: a entrada traz o preço em
   * decimal porque JSON não tem tipo monetário, e o domínio só aceita `Money`.
   */
  static toProps(item: CreateBudgetItemInput): BudgetItemProps {
    return {
      partId: item.partId,
      serviceId: item.serviceId,
      description: item.description,
      type: item.type,
      quantity: item.quantity,
      unitPrice: Money.fromDecimal(item.unitPrice),
    };
  }
}

/** Resolve uma vez por referência distinta, e não por item. */
function distinctRefs(
  items: CreateBudgetItemInput[],
  pick: (item: CreateBudgetItemInput) => string | undefined,
): string[] {
  return [
    ...new Set(
      items
        .map((item) => pick(item)?.trim())
        .filter((ref): ref is string => Boolean(ref)),
    ),
  ];
}
