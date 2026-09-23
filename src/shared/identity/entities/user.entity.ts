import { randomUUID } from 'crypto';
import { DomainException } from '../../domain/domain.exception';

export type UserRole = 'ADMIN' | 'EMPLOYEE' | 'CUSTOMER';

export interface UserProps {
  email: string;
  passwordHash: string;
  role?: UserRole;
  /** Cliente dono do login. Obrigatório no CUSTOMER, proibido nos demais. */
  clientId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export class User {
  private constructor(
    private readonly id: string,
    private readonly props: Required<UserProps>,
  ) {
    const isCustomer = props.role === 'CUSTOMER';

    if (isCustomer && !props.clientId) {
      throw new DomainException(
        'Login de cliente precisa estar vinculado a um cliente',
      );
    }

    if (!isCustomer && props.clientId) {
      throw new DomainException(
        'Só o login de cliente é vinculado a um cliente',
      );
    }
  }

  static create(props: UserProps): User {
    const now = new Date();

    return new User(randomUUID(), {
      ...props,
      role: props.role ?? 'ADMIN',
      clientId: props.clientId ?? null,
      createdAt: props.createdAt ?? now,
      updatedAt: props.updatedAt ?? now,
    });
  }

  static createCustomer(props: {
    email: string;
    passwordHash: string;
    clientId: string;
  }): User {
    return User.create({ ...props, role: 'CUSTOMER' });
  }

  static restore(
    id: string,
    props: Omit<Required<UserProps>, 'clientId'> & { clientId?: string | null },
  ): User {
    return new User(id, { ...props, clientId: props.clientId ?? null });
  }

  getId(): string {
    return this.id;
  }

  getEmail(): string {
    return this.props.email;
  }

  getPasswordHash(): string {
    return this.props.passwordHash;
  }

  getRole(): UserRole {
    return this.props.role;
  }

  getClientId(): string | null {
    return this.props.clientId;
  }

  getCreatedAt(): Date {
    return this.props.createdAt;
  }

  getUpdatedAt(): Date {
    return this.props.updatedAt;
  }
}
