import { randomUUID } from 'crypto';
import { DomainException } from '../../../shared/domain/domain.exception';
import { Money } from '../../../shared/domain/value-objects/money.vo';

export interface ServiceProps {
  name: string;
  description?: string | null;
  /** O domínio só fala Money. A conversão do decimal (149.90) que chega no
   *  DTO acontece na camada de aplicação, nunca aqui dentro. */
  price: Money;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Serviço do catálogo da oficina: o que a oficina sabe fazer e por quanto.
 *
 * É catálogo, não execução. O preço praticado numa OS é copiado para o item de
 * orçamento no momento em que o orçamento é montado — reajustar o catálogo
 * depois não pode alterar o que já foi acordado com o cliente.
 */
export class Service {
  private readonly id: string;
  private name: string;
  private description?: string;
  private price: Money;
  private readonly createdAt: Date;
  private updatedAt: Date;

  private constructor(id: string, props: ServiceProps) {
    this.id = id;

    this.setName(props.name);
    this.setDescription(props.description);
    this.setPrice(props.price);

    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
  }

  static create(props: ServiceProps): Service {
    return new Service(randomUUID(), props);
  }

  static restore(id: string, props: ServiceProps): Service {
    return new Service(id, props);
  }

  getId(): string {
    return this.id;
  }

  getName(): string {
    return this.name;
  }

  getDescription(): string | undefined {
    return this.description;
  }

  getPrice(): Money {
    return this.price;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  changeName(name: string): void {
    this.setName(name);
    this.touch();
  }

  changeDescription(description: string | null): void {
    this.setDescription(description);
    this.touch();
  }

  changePrice(price: Money): void {
    this.setPrice(price);
    this.touch();
  }

  private setName(name: string): void {
    const trimmed = (name ?? '').trim();

    if (!trimmed) {
      throw new DomainException('Nome do serviço é obrigatório');
    }

    this.name = trimmed;
  }

  private setDescription(description?: string | null): void {
    const trimmed = (description ?? '').trim();

    this.description = trimmed || undefined;
  }

  private setPrice(price: Money): void {
    // Money já barra negativo. Zero passaria, e um serviço de catálogo sem
    // preço vira orçamento com item de graça sem ninguém perceber.
    if (price.valueInCents === 0) {
      throw new DomainException('Preço do serviço deve ser maior que zero');
    }

    this.price = price;
  }

  private touch(): void {
    this.updatedAt = new Date();
  }
}
