import { ConfigService } from '@nestjs/config';
import { EmailMessage } from './email-sender';
import { NodemailerEmailSender } from './nodemailer-email-sender';

describe('NodemailerEmailSender', () => {
  it('sends rendered fields with the configured sender address', async () => {
    const sendMail = jest.fn().mockResolvedValue(undefined);
    const createTransport = jest.fn().mockReturnValue({ sendMail });
    jest.mock('nodemailer', () => ({ createTransport }));

    const config = {
      get: jest.fn((key: string) =>
        ({
          SMTP_HOST: 'smtp.example.com',
          SMTP_PORT: '587',
          SMTP_SECURE: 'false',
          MAIL_FROM: 'Oficina <oficina@example.com>',
        })[key],
      ),
    } as unknown as ConfigService;
    const sender = new NodemailerEmailSender(config);
    const message: EmailMessage = {
      to: 'maria@example.com',
      subject: 'Orçamento disponível',
      text: 'Seu orçamento está disponível.',
      html: '<p>Seu orçamento está disponível.</p>',
    };

    await sender.send(message);

    expect(sendMail).toHaveBeenCalledWith({
      from: 'Oficina <oficina@example.com>',
      ...message,
    });
  });
});
