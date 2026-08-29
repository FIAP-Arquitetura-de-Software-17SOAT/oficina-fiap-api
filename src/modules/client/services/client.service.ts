import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateClientDto, UpdateClientDto } from '../dto/client.dto';
import { Client } from '../entities/client.entity';
import { ClientRepository } from '../repositories/client.repository';
import { Document } from '../value-objects/document.vo';
import { Email } from '../value-objects/email.vo';

@Injectable()
export class ClientService {
  constructor(private readonly clientRepository: ClientRepository) {}

  async create(dto: CreateClientDto): Promise<Client> {
    // Normaliza pelos VOs antes de consultar: "123.456.789-09" e "12345678909"
    // são o mesmo cliente, e o banco guarda apenas os dígitos.
    const document = Document.create(dto.document);
    const email = Email.create(dto.email);

    await this.assertDocumentIsAvailable(document);
    await this.assertEmailIsAvailable(email);

    const client = Client.create({
      name: dto.name,
      document: document.getValue(),
      email: email.getValue(),
      phone: dto.phone,
    });

    return this.clientRepository.create(client);
  }

  async findById(id: string): Promise<Client> {
    const client = await this.clientRepository.findById(id);

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    return client;
  }

  async findAll(): Promise<Client[]> {
    return this.clientRepository.findAll();
  }

  async update(id: string, dto: UpdateClientDto): Promise<Client> {
    const client = await this.findById(id);

    if (dto.email) {
      await this.assertEmailIsAvailable(Email.create(dto.email), id);
      client.changeEmail(dto.email);
    }

    if (dto.name) {
      client.changeName(dto.name);
    }

    if (dto.phone) {
      client.changePhone(dto.phone);
    }

    return this.clientRepository.update(client);
  }

  async delete(id: string): Promise<void> {
    await this.findById(id);

    await this.clientRepository.delete(id);
  }

  private async assertDocumentIsAvailable(document: Document): Promise<void> {
    const existing = await this.clientRepository.findByDocument(
      document.getValue(),
    );

    if (existing) {
      throw new ConflictException('Client already exists');
    }
  }

  private async assertEmailIsAvailable(
    email: Email,
    allowedClientId?: string,
  ): Promise<void> {
    const existing = await this.clientRepository.findByEmail(email.getValue());

    if (existing && existing.getId() !== allowedClientId) {
      throw new ConflictException('E-mail already in use');
    }
  }
}
