export interface CreateServiceInput {
  name: string;
  description?: string | null;
  /** Decimal como chega na API (149.90); a aplicação converte para Money. */
  price: number;
}

export interface UpdateServiceInput {
  name?: string;
  description?: string | null;
  price?: number;
}
