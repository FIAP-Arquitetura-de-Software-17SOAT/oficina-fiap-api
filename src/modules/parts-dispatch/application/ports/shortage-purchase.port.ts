export interface ShortageItem {
  partId: string;
  quantity: number;
}

export abstract class ShortagePurchasePort {
  abstract registerShortage(items: ShortageItem[]): Promise<{ id: string }>;
}
