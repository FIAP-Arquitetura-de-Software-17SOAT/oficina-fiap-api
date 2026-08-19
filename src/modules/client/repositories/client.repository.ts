import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { Client } from '../entities/client.entity';

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'P2003'
  );
}

interface ClientRow {
  id: string;
  name: string;
  document: string;
  email: string;
  phone: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ClientRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(client: Client): Promise<Client> {
    const row = await this.prisma.client.create({
      data: this.toPersistence(client),
    });

    return this.toDomain(row);
  }

  async findById(id: string): Promise<Client | null> {
    const row = await this.prisma.client.findUnique({ where: { id } });

    return row ? this.toDomain(row) : null;
  }

  async findByDocument(document: string): Promise<Client | null> {
    const row = await this.prisma.client.findUnique({ where: { document } });

    return row ? this.toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<Client | null> {
    const row = await this.prisma.client.findUnique({ where: { email } });

    return row ? this.toDomain(row) : null;
  }

  async findAll(): Promise<Client[]> {
    const rows = await this.prisma.client.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => this.toDomain(row));
  }

  async update(client: Client): Promise<Client> {
    const row = await this.prisma.client.update({
      where: { id: client.getId() },
      data: {
        name: client.getName(),
        email: client.getEmail().getValue(),
        phone: client.getPhone(),
        updatedAt: client.getUpdatedAt(),
      },
    });

    return this.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    try {
      await this.prisma.client.delete({ where: { id } });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ConflictException(
          'Client has vehicles and cannot be removed',
        );
      }

      throw error;
    }
  }

  private toPersistence(client: Client) {
    return {
      id: client.getId(),
      name: client.getName(),
      document: client.getDocument().getValue(),
      email: client.getEmail().getValue(),
      phone: client.getPhone(),
      createdAt: client.getCreatedAt(),
      updatedAt: client.getUpdatedAt(),
    };
  }

  private toDomain(row: ClientRow): Client {
    return Client.restore(row.id, {
      name: row.name,
      document: row.document,
      email: row.email,
      phone: row.phone,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
