import { ConfigService } from '@nestjs/config';
import { EmailMessage } from './email-sender';
import { NodemailerEmailSender } from './nodemailer-email-sender';

const mockSendMail = jest.fn().mockResolvedValue(undefined);
const mockCreateTransport = jest.fn().mockReturnValue({
  sendMail: mockSendMail,
});

jest.mock('nodemailer', () => ({
  createTransport: mockCreateTransport,
}));

describe('NodemailerEmailSender', () => {
  it('sends rendered fields with the configured sender address', async () => {
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

    expect(mockSendMail).toHaveBeenCalledWith({
      from: 'Oficina <oficina@example.com>',
      ...message,
    });
  });
});
