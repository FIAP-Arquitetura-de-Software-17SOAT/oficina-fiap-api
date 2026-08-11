import { Client } from '../src/modules/client/entities/client.entity';

/**
 * Substitui o Prisma nos testes de integração: o objetivo é exercitar o
 * pipeline HTTP completo (validação, filtro de domínio, service, entidade e
 * mapper) sem depender de um banco em pé.
 */
export class InMemoryClientRepository {
  private readonly clients = new Map<string, Client>();

  create(client: Client): Promise<Client> {
    this.clients.set(client.getId(), client);

    return Promise.resolve(client);
  }

  findById(id: string): Promise<Client | null> {
    return Promise.resolve(this.clients.get(id) ?? null);
  }

  findByDocument(document: string): Promise<Client | null> {
    return Promise.resolve(
      this.all().find((c) => c.getDocument().getValue() === document) ?? null,
    );
  }

  findByEmail(email: string): Promise<Client | null> {
    return Promise.resolve(
      this.all().find((c) => c.getEmail().getValue() === email) ?? null,
    );
  }

  findAll(): Promise<Client[]> {
    return Promise.resolve(
      this.all().sort(
        (a, b) => b.getCreatedAt().getTime() - a.getCreatedAt().getTime(),
      ),
    );
  }

  update(client: Client): Promise<Client> {
    this.clients.set(client.getId(), client);

    return Promise.resolve(client);
  }

  delete(id: string): Promise<void> {
    this.clients.delete(id);

    return Promise.resolve();
  }

  private all(): Client[] {
    return Array.from(this.clients.values());
  }
}
