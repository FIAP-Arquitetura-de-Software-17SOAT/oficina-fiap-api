import { randomUUID } from 'crypto';

export type UserRole = 'ADMIN';

export interface UserProps {
  email: string;
  passwordHash: string;
  role?: UserRole;
  createdAt?: Date;
  updatedAt?: Date;
}

export class User {
  private constructor(
    private readonly id: string,
    private readonly props: Required<UserProps>,
  ) {}

  static create(props: UserProps): User {
    const now = new Date();

    return new User(randomUUID(), {
      ...props,
      role: props.role ?? 'ADMIN',
      createdAt: props.createdAt ?? now,
      updatedAt: props.updatedAt ?? now,
    });
  }

  static restore(id: string, props: Required<UserProps>): User {
    return new User(id, props);
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

  getCreatedAt(): Date {
    return this.props.createdAt;
  }

  getUpdatedAt(): Date {
    return this.props.updatedAt;
  }
}
