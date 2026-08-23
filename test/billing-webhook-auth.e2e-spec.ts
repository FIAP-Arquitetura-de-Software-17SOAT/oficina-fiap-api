import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import {
  InvalidPaymentWebhookSignatureError,
  PaymentGateway,
} from '../src/modules/billing/gateways/payment-gateway';
import { configureApp } from '../src/setup-app';
import { PrismaService } from '../src/shared/database/prisma.service';

describe('Billing Stripe webhook authentication', () => {
  let app: INestApplication<App>;
  let http: App;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(PaymentGateway)
      .useValue({
        parsePaymentWebhook: jest
          .fn()
          .mockRejectedValue(new InvalidPaymentWebhookSignatureError()),
      })
      .compile();

    app = configureApp(
      moduleFixture.createNestApplication({ rawBody: true }),
    ) as INestApplication<App>;
    await app.init();
    http = app.getHttpServer();
  });

  afterEach(async () => {
    await app.close();
  });

  it('accepts an unauthenticated Stripe webhook request for signature verification', async () => {
    await request(http)
      .post('/api/v1/billings/stripe/webhook')
      .set('stripe-signature', 'invalid-signature')
      .send({ id: 'evt_test' })
      .expect(400);
  });
});
