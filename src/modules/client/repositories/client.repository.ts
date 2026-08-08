import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Client } from '../entities/client.entity';

@Injectable()
export class ClientRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(client: Client): Promise<Client> {
    const data = await this.prisma.client.create({
      data: {
        id: client.getId(),
        name: client.getName(),
        document: client.getDocument(),
        email: client.getEmail(),
        phone: client.getPhone(),
        createdAt: client.getCreatedAt(),
        updatedAt: client.getUpdatedAt(),
      },
    });

    return Client.restore(data.id, {
      name: data.name,
      document: data.document,
      email: data.email,
      phone: data.phone,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }

  async findById(id: string): Promise<Client | null> {
    const data = await this.prisma.client.findUnique({
      where: { id },
    });

    if (!data) {
      return null;
    }

    return Client.restore(data.id, {
      name: data.name,
      document: data.document,
      email: data.email,
      phone: data.phone,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }

  async findByDocument(document: string): Promise<Client | null> {
    const data = await this.prisma.client.findUnique({
      where: { document },
    });

    if (!data) {
      return null;
    }

    return Client.restore(data.id, {
      name: data.name,
      document: data.document,
      email: data.email,
      phone: data.phone,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }

  async findAll(): Promise<Client[]> {
    const clients = await this.prisma.client.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });

    return clients.map((data) =>
      Client.restore(data.id, {
        name: data.name,
        document: data.document,
        email: data.email,
        phone: data.phone,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      }),
    );
  }

  async update(client: Client): Promise<Client> {
    const data = await this.prisma.client.update({
      where: {
        id: client.getId(),
      },
      data: {
        name: client.getName(),
        email: client.getEmail(),
        phone: client.getPhone(),
        updatedAt: client.getUpdatedAt(),
      },
    });

    return Client.restore(data.id, {
      name: data.name,
      document: data.document,
      email: data.email,
      phone: data.phone,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }
}
