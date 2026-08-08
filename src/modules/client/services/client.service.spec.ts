jest.mock('../repositories/client.repository', () => ({
  ClientRepository: class ClientRepository {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ClientService } from './client.service';

const { ClientRepository } = jest.requireMock(
  '../repositories/client.repository',
) as {
  ClientRepository: new () => unknown;
};

describe('ClientService', () => {
  let service: ClientService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientService,
        {
          provide: ClientRepository,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<ClientService>(ClientService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
