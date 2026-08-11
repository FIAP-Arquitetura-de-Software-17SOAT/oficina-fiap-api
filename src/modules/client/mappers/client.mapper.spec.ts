import { Client } from '../entities/client.entity';
import { ClientMapper } from './client.mapper';

const makeClient = (email = 'maria@example.com') =>
  Client.create({
    name: 'Maria Silva',
    document: '529.982.247-25',
    email,
    phone: '(11) 99999-8888',
  });

describe('ClientMapper', () => {
  it('desembrulha os Value Objects para primitivos', () => {
    const response = ClientMapper.toResponse(makeClient());

    expect(response).toEqual({
      id: expect.any(String) as string,
      name: 'Maria Silva',
      document: '52998224725',
      email: 'maria@example.com',
      phone: '11999998888',
      createdAt: expect.any(Date) as Date,
      updatedAt: expect.any(Date) as Date,
    });
  });

  it('serializa document e email como string, não como objeto', () => {
    const json = JSON.parse(
      JSON.stringify(ClientMapper.toResponse(makeClient())),
    ) as Record<string, unknown>;

    expect(typeof json.document).toBe('string');
    expect(typeof json.email).toBe('string');
  });

  it('mapeia listas preservando a ordem', () => {
    const responses = ClientMapper.toResponseList([
      makeClient('a@example.com'),
      makeClient('b@example.com'),
    ]);

    expect(responses.map((r) => r.email)).toEqual([
      'a@example.com',
      'b@example.com',
    ]);
  });

  it('mapeia lista vazia', () => {
    expect(ClientMapper.toResponseList([])).toEqual([]);
  });
});
