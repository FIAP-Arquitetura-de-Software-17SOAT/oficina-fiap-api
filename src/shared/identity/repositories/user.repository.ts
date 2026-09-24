import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { User, UserRole } from '../entities/user.entity';

interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  clientId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { email } });

    return row ? this.toDomain(row) : null;
  }

  async findByClientId(clientId: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { clientId } });

    return row ? this.toDomain(row) : null;
  }

  async create(user: User): Promise<User> {
    const row = await this.prisma.user.create({
      data: {
        id: user.getId(),
        email: user.getEmail(),
        passwordHash: user.getPasswordHash(),
        role: user.getRole(),
        clientId: user.getClientId(),
        createdAt: user.getCreatedAt(),
        updatedAt: user.getUpdatedAt(),
      },
    });

    return this.toDomain(row);
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });

    return row ? this.toDomain(row) : null;
  }

  private toDomain(row: UserRow): User {
    return User.restore(row.id, {
      email: row.email,
      passwordHash: row.passwordHash,
      role: row.role,
      clientId: row.clientId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
