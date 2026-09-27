import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import {
  isForeignKeyViolation,
  isUniqueViolation,
  uniqueViolationFields,
} from '../../../../shared/database/prisma-errors';
import { Client } from '../../domain/entities/client.entity';
import { ClientApplicationError } from '../../application/errors/client-application.error';
import { ClientRepositoryPort } from '../../application/ports/client-repository.port';
import { ClientPersistenceMapper } from './client-persistence.mapper';

@Injectable()
export class PrismaClientRepository implements ClientRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async create(client: Client): Promise<Client> {
    try {
      const row = await this.prisma.client.create({
        data: ClientPersistenceMapper.toPersistence(client),
      });

      return ClientPersistenceMapper.toDomain(row);
    } catch (error) {
      // As checagens no service existem pela mensagem melhor, mas há janela
      // entre consultar e inserir: duas requisições simultâneas passam as duas
      // pela consulta e uma recebe P2002. Sem esta tradução, essa perde a
      // corrida e leva 500 em vez de 409.
      if (isUniqueViolation(error)) {
        throw new ClientApplicationError(
          uniqueViolationFields(error).includes('email')
            ? 'CLIENT_EMAIL_IN_USE'
            : 'CLIENT_ALREADY_EXISTS',
        );
      }

      throw error;
    }
  }

  async findById(id: string): Promise<Client | null> {
    const row = await this.prisma.client.findUnique({ where: { id } });

    return row ? ClientPersistenceMapper.toDomain(row) : null;
  }

  async findByDocument(document: string): Promise<Client | null> {
    const row = await this.prisma.client.findUnique({ where: { document } });

    return row ? ClientPersistenceMapper.toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<Client | null> {
    const row = await this.prisma.client.findUnique({ where: { email } });

    return row ? ClientPersistenceMapper.toDomain(row) : null;
  }

  async findAll(): Promise<Client[]> {
    const rows = await this.prisma.client.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => ClientPersistenceMapper.toDomain(row));
  }

  async update(client: Client): Promise<Client> {
    const row = await this.prisma.client.update({
      where: { id: client.getId() },
      data: ClientPersistenceMapper.toUpdate(client),
    });

    return ClientPersistenceMapper.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    try {
      await this.prisma.client.delete({ where: { id } });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ClientApplicationError('CLIENT_HAS_VEHICLES');
      }

      throw error;
    }
  }
}
