import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

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
    (NestFactory.create as jest.Mock).mockResolvedValue({ listen });

    await import('./main');
    await new Promise(process.nextTick);

    expect(NestFactory.create).toHaveBeenCalledWith(AppModule, {
      rawBody: true,
    });
    expect(listen).toHaveBeenCalled();
  });
});
