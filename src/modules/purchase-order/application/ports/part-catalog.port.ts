import { Money } from '../../../../shared/domain/value-objects/money.vo';

/** O que o pedido precisa saber de uma peça: nome para exibir e preço para o snapshot. */
export interface CatalogPart {
  id: string;
  name: string;
  unitPrice: Money;
}

export abstract class PartCatalogPort {
  abstract findById(partId: string): Promise<CatalogPart | null>;
}
