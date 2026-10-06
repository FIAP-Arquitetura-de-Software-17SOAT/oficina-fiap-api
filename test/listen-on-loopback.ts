import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

/**
 * Abre o server de teste em 127.0.0.1 antes de entregá-lo ao supertest.
 *
 * Sem isso o supertest faz `listen(0)` por conta própria, o Node abre em `::`
 * (dual-stack) e, no macOS, esse bind aceita uma porta efêmera que outro
 * processo já ocupa em 127.0.0.1 (VS Code, Postman, OrbStack...). A requisição
 * vai para `127.0.0.1:porta`, cai no processo errado e volta 404 vazio, 401,
 * ECONNRESET ou nada até o timeout. Escutando em IPv4 loopback a porta
 * escolhida é garantidamente livre nesse endereço, e o supertest reaproveita
 * o server já aberto em vez de abrir e fechar um por requisição.
 *
 * `app.close()` fecha o server, então os `afterEach`/`afterAll` existentes
 * continuam suficientes.
 */
export async function listenOnLoopback(app: INestApplication): Promise<App> {
  await app.listen(0, '127.0.0.1');
  return app.getHttpServer() as App;
}
