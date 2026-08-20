import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { User, UserRole } from '../entities/user.entity';

interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
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

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });

    return row ? this.toDomain(row) : null;
  }

  private toDomain(row: UserRow): User {
    return User.restore(row.id, {
      email: row.email,
      passwordHash: row.passwordHash,
      role: row.role,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
