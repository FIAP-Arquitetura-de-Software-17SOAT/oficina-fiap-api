export class PurchaseOrderNumber {
  private constructor(
    private readonly number: string,
  ) {}

  static create(
    value: string,
  ): PurchaseOrderNumber {
    if (!value?.trim()) {
      throw new Error(
        'O número do pedido deve ser informado',
      );
    }

    const normalized =
      value.trim().toUpperCase();

    const pattern =
      /^PC-\d{4}-\d{4}$/;

    if (!pattern.test(normalized)) {
      throw new Error(
        'Número do pedido deve seguir o formato PC-AAAA-NNNN',
      );
    }

    return new PurchaseOrderNumber(
      normalized,
    );
  }

  equals(
    other: PurchaseOrderNumber,
  ): boolean {
    return this.number === other.number;
  }

  get value(): string {
    return this.number;
  }
}