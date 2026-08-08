import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateClientDto, UpdateClientDto } from '../dto/client.dto';
import { Client } from '../entities/client.entity';
import { ClientRepository } from '../repositories/client.repository';

@Injectable()
export class ClientService {
  constructor(private readonly clientRepository: ClientRepository) {}

  async create(dto: CreateClientDto): Promise<Client> {
    const existingClient = await this.clientRepository.findByDocument(
      dto.document,
    );

    if (existingClient) {
      throw new ConflictException('Client already exists');
    }

    const client = Client.create({
      name: dto.name,
      document: dto.document,
      email: dto.email,
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
    const client = await this.clientRepository.findById(id);

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    if (dto.name) {
      client.changeName(dto.name);
    }

    if (dto.email) {
      client.changeEmail(dto.email);
    }

    if (dto.phone) {
      client.changePhone(dto.phone);
    }

    return this.clientRepository.update(client);
  }
}
