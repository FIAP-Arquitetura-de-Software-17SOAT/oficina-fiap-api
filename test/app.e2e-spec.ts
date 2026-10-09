import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { listenOnLoopback } from './listen-on-loopback';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/database/prisma.service';
import { configureApp } from '../src/setup-app';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let http: App;
  const queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: queryRaw })
      .compile();

    app = configureApp(
      moduleFixture.createNestApplication(),
    ) as INestApplication<App>;
    await app.init();
    http = await listenOnLoopback(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health responde ok', () => {
    return request(http)
      .get('/api/v1/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('GET /api/v1/health responde 503 sem banco', async () => {
    queryRaw.mockRejectedValueOnce(new Error('database unavailable'));
    await request(http).get('/api/v1/health').expect(503);
  });

  it('GET /health responde 503 sem banco', async () => {
    queryRaw.mockRejectedValueOnce(new Error('database unavailable'));
    await request(http).get('/health').expect(503);
  });

  it('GET /api/v1/live responde ok sem consultar o banco', async () => {
    queryRaw.mockClear();
    await request(http)
      .get('/api/v1/live')
      .expect(200)
      .expect({ status: 'ok' });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('aplica headers basicos de hardening HTTP', async () => {
    const response = await request(http).get('/api/v1/health').expect(200);

    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['cross-origin-resource-policy']).toBe(
      'cross-origin',
    );
  });

  it('permite CORS para o frontend local', async () => {
    const response = await request(http)
      .options('/api/v1/health')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET')
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
  });

  it('nao libera CORS para outras origens locais', async () => {
    const response = await request(http)
      .options('/api/v1/health')
      .set('Origin', 'http://localhost:9999')
      .set('Access-Control-Request-Method', 'GET');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('expoe readiness e liveness na raiz para probes do Kubernetes', async () => {
    await request(http).get('/health').expect(200).expect({ status: 'ok' });
    await request(http).get('/live').expect(200).expect({ status: 'ok' });
  });
});
