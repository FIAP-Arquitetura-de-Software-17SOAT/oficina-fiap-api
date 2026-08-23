import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailSender } from './email-sender';
import { EmailModule } from './email.module';
import { NodemailerEmailSender } from './nodemailer-email-sender';

describe('EmailModule', () => {
  it('resolves EmailSender as NodemailerEmailSender', async () => {
    const module = await Test.createTestingModule({ imports: [EmailModule] })
      .overrideProvider(ConfigService)
      .useValue({ get: jest.fn() })
      .compile();

    expect(module.get(EmailSender)).toBeInstanceOf(NodemailerEmailSender);
  });
});
