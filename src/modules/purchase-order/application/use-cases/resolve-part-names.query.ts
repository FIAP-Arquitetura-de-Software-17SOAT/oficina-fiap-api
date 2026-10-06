import { PurchaseOrder } from '../../domain/entities/purchase-order.entity';
import { PartCatalogPort } from '../ports/part-catalog.port';

/**
 * Nome da peça para exibição no pedido. O item guarda só o `partId` — o nome
 * não é copiado de propósito, porque não é dado acordado com o fornecedor
 * como preço e quantidade: renomear a peça no cadastro deve refletir aqui.
 *
 * Resolve uma vez por peça distinta, e não por item, para não fazer N+1 numa
 * listagem. Peça removida devolve `null` em vez de derrubar a resposta.
 */
export class ResolvePartNamesQuery {
  constructor(private readonly catalog: PartCatalogPort) {}

  async execute(
    purchaseOrders: PurchaseOrder[],
  ): Promise<Map<string, string | null>> {
    const partIds = [
      ...new Set(
        purchaseOrders.flatMap((purchaseOrder) =>
          purchaseOrder.getItems().map((item) => item.getPartId()),
        ),
      ),
    ];

    const names = new Map<string, string | null>();
    for (const partId of partIds) {
      const part = await this.catalog.findById(partId);
      names.set(partId, part?.name ?? null);
    }
    return names;
  }
}
