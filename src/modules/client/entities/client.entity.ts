import { randomUUID } from 'crypto';
import { DomainException } from '../../../shared/domain/domain.exception';
import { CpfCnpj } from '../value-objects/cpf-cnpj.vo';
import { Email } from '../value-objects/email.vo';

export interface ClientProps {
  name: string;
  document: string;
  email: string;
  phone: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Client {
  private readonly id: string;
  private name: string;
  private document: CpfCnpj;
  private email: Email;
  private phone: string;
  private readonly createdAt: Date;
  private updatedAt: Date;

  private constructor(id: string, props: ClientProps) {
    this.id = id;

    this.setName(props.name);
    this.setDocument(props.document);
    this.setEmail(props.email);
    this.setPhone(props.phone);

    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
  }

  static create(props: ClientProps): Client {
    return new Client(randomUUID(), props);
  }

  static restore(id: string, props: ClientProps): Client {
    return new Client(id, props);
  }

  getId(): string {
    return this.id;
  }

  getName(): string {
    return this.name;
  }

  getDocument(): CpfCnpj {
    return this.document;
  }

  getEmail(): Email {
    return this.email;
  }

  getPhone(): string {
    return this.phone;
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

  changeEmail(email: string): void {
    this.setEmail(email);
    this.touch();
  }

  changePhone(phone: string): void {
    this.setPhone(phone);
    this.touch();
  }

  private setName(name: string): void {
    const trimmed = (name ?? '').trim();

    if (!trimmed) {
      throw new DomainException('Nome do cliente é obrigatório');
    }

    this.name = trimmed;
  }

  private setDocument(document: string): void {
    this.document = CpfCnpj.create(document);
  }

  private setEmail(email: string): void {
    this.email = Email.create(email);
  }

  private setPhone(phone: string): void {
    const digits = (phone ?? '').replace(/\D/g, '');

    if (digits.length < 10 || digits.length > 11) {
      throw new DomainException('Telefone deve ter DDD e 8 ou 9 dígitos');
    }

    this.phone = digits;
  }

  private touch(): void {
    this.updatedAt = new Date();
  }
}
