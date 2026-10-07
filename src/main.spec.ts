import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { bootstrap } from './main';

jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: jest.fn(),
  },
}));

jest.mock('./setup-app', () => ({
  configureApp: jest.fn((app: INestApplication) => app),
  setupSwagger: jest.fn(),
}));

describe('main bootstrap', () => {
  it('enables rawBody for Stripe webhook signature verification', async () => {
    const mockedNestFactory = jest.mocked(NestFactory);
    const listen = jest.fn();

    mockedNestFactory.create.mockResolvedValue({
      listen,
    } as unknown as INestApplication);

    await bootstrap();

    expect(mockedNestFactory.create.mock.calls).toContainEqual([
      AppModule,
      { rawBody: true },
    ]);
    expect(listen).toHaveBeenCalled();
  });
});
