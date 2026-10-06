import { ClientApplicationError } from '../../../client/application/errors/client-application.error';
import { FindClientUseCase } from '../../../client/application/use-cases/find-client.use-case';
import { ClientLookupAdapter } from './client-lookup.adapter';

describe('ClientLookupAdapter', () => {
  const findClient = { execute: jest.fn() };
  let adapter: ClientLookupAdapter;

  beforeEach(() => {
    jest.resetAllMocks();
    adapter = new ClientLookupAdapter(
      findClient as unknown as FindClientUseCase,
    );
  });

  it('answers true when the client module finds the client', async () => {
    findClient.execute.mockResolvedValue({ id: 'client-id' });

    await expect(adapter.exists('client-id')).resolves.toBe(true);
    expect(findClient.execute).toHaveBeenCalledWith('client-id');
  });

  it('translates CLIENT_NOT_FOUND into false instead of leaking the error', async () => {
    findClient.execute.mockRejectedValue(
      new ClientApplicationError('CLIENT_NOT_FOUND'),
    );

    await expect(adapter.exists('missing')).resolves.toBe(false);
  });

  it('propagates any other failure from the client module', async () => {
    findClient.execute.mockRejectedValue(new Error('database down'));

    await expect(adapter.exists('client-id')).rejects.toThrow('database down');
  });
});
