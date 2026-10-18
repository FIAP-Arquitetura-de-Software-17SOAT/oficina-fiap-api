import { AppController } from './app.controller';
import { PrismaService } from './shared/database/prisma.service';

describe('AppController', () => {
  const queryRaw = jest.fn();
  const controller = new AppController({
    $queryRaw: queryRaw,
  } as unknown as PrismaService);

  beforeEach(() => queryRaw.mockReset());

  it('readiness consulta o banco antes de responder ok', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    await expect(controller.health()).resolves.toEqual({ status: 'ok' });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('readiness responde 503 quando o banco falha', async () => {
    queryRaw.mockRejectedValue(new Error('database unavailable'));
    await expect(controller.health()).rejects.toMatchObject({ status: 503 });
  });

  it('liveness responde sem consultar o banco', () => {
    expect(controller.live()).toEqual({ status: 'ok' });
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
