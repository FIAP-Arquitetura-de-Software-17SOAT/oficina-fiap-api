import { Inject, Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailSender } from './email-sender';
import { EmailModule } from './email.module';
import { NodemailerEmailSender } from './nodemailer-email-sender';

@Injectable()
class EmailConsumer {
  constructor(@Inject(EmailSender) readonly sender: EmailSender) {}
}

describe('EmailModule', () => {
  it('exports EmailSender for consumers as NodemailerEmailSender', async () => {
    const module = await Test.createTestingModule({
      imports: [EmailModule],
      providers: [
        { provide: ConfigService, useValue: { get: jest.fn() } },
        EmailConsumer,
      ],
    })
      .compile();

    expect(module.get(EmailConsumer).sender).toBeInstanceOf(
      NodemailerEmailSender,
    );
  });
});
