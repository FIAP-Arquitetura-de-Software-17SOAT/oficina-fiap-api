import { randomUUID } from 'crypto';

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
  private document: string;
  private email: string;
  private phone: string;
  private createdAt: Date;
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

  getDocument(): string {
    return this.document;
  }

  getEmail(): string {
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
    if (!name.trim()) {
      throw new Error('Client name is required');
    }

    this.name = name;
  }

  private setDocument(document: string): void {
    if (!document.trim()) {
      throw new Error('Client document is required');
    }

    this.document = document;
  }

  private setEmail(email: string): void {
    if (!email.includes('@')) {
      throw new Error('Invalid email');
    }

    this.email = email;
  }

  private setPhone(phone: string): void {
    if (!phone.trim()) {
      throw new Error('Client phone is required');
    }

    this.phone = phone;
  }

  private touch(): void {
    this.updatedAt = new Date();
  }
}
