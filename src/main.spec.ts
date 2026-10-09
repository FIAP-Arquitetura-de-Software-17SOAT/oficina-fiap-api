import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { bootstrap } from './main';

jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: jest.fn(),
  },
}));

jest.mock('./setup-app', () => ({
  configureApp: jest.fn((app) => app),
  setupSwagger: jest.fn(),
}));

describe('main bootstrap', () => {
  it('enables rawBody for Stripe webhook signature verification', async () => {
    const listen = jest.fn();
    const enableShutdownHooks = jest.fn();
    (NestFactory.create as jest.Mock).mockResolvedValue({
      listen,
      enableShutdownHooks,
    });

    await bootstrap();

    expect(NestFactory.create).toHaveBeenCalledWith(AppModule, {
      rawBody: true,
    });
    expect(listen).toHaveBeenCalled();
    expect(enableShutdownHooks).toHaveBeenCalledWith(['SIGTERM', 'SIGINT']);
  });
});
