export interface CreatePurchaseOrderInput {
  number: string;
  supplier: string;
}

export interface AddPurchaseOrderItemInput {
  partId: string;
  quantity: number;
  /** Decimal como chega na API (150.50). */
  unitPrice: number;
}

export interface ShortageItemInput {
  partId: string;
  quantity: number;
}

export interface RegisterShortageInput {
  supplier?: string;
  items: ShortageItemInput[];
}
