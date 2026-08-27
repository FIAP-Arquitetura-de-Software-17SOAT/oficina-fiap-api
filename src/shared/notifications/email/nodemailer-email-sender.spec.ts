import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { EmailMessage } from './email-sender';
import { NodemailerEmailSender } from './nodemailer-email-sender';

const mockSendMail = jest.fn().mockResolvedValue(undefined);

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

const mockCreateTransport = nodemailer.createTransport as jest.Mock;

describe('NodemailerEmailSender', () => {
  const settings: Record<string, string> = {
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '587',
    SMTP_SECURE: 'false',
    MAIL_FROM: 'Oficina <oficina@example.com>',
  };
  const message: EmailMessage = {
    to: 'maria@example.com',
    subject: 'Orçamento disponível',
    text: 'Seu orçamento está disponível.',
    html: '<p>Seu orçamento está disponível.</p>',
  };
  const config = {
    get: jest.fn(),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateTransport.mockReturnValue({ sendMail: mockSendMail });
    (config.get as jest.Mock).mockImplementation(
      (key: string) => settings[key],
    );
  });

  it('sends rendered fields with the configured sender address', async () => {
    const sender = new NodemailerEmailSender(config);

    await sender.send(message);

    expect(mockSendMail).toHaveBeenCalledWith({
      from: 'Oficina <oficina@example.com>',
      ...message,
    });
  });

  it.each([['SMTP_HOST'], ['SMTP_PORT'], ['SMTP_SECURE'], ['MAIL_FROM']])(
    'rejects missing %s at send time',
    async (key) => {
      (config.get as jest.Mock).mockImplementation((asked: string) =>
        asked === key ? undefined : settings[asked],
      );

      await expect(new NodemailerEmailSender(config).send(message)).rejects.toThrow(
        `${key} is required`,
      );
    },
  );

  it('rejects invalid SMTP_PORT and SMTP_SECURE values', async () => {
    (config.get as jest.Mock).mockReturnValue('invalid');

    await expect(new NodemailerEmailSender(config).send(message)).rejects.toThrow(
      'SMTP_PORT must be a valid port',
    );
  });

  it('rejects an SMTP_SECURE value other than true or false', async () => {
    (config.get as jest.Mock).mockImplementation((key: string) =>
      key === 'SMTP_SECURE' ? 'yes' : settings[key],
    );

    await expect(new NodemailerEmailSender(config).send(message)).rejects.toThrow(
      'SMTP_SECURE must be either true or false',
    );
  });

  it('rejects SMTP_PORT outside the valid port range', async () => {
    (config.get as jest.Mock).mockImplementation((key: string) =>
      key === 'SMTP_PORT' ? '65536' : settings[key],
    );

    await expect(new NodemailerEmailSender(config).send(message)).rejects.toThrow(
      'SMTP_PORT must be a valid port',
    );
  });

  it('rejects an invalid MAIL_FROM email address', async () => {
    (config.get as jest.Mock).mockImplementation((key: string) =>
      key === 'MAIL_FROM' ? 'Oficina <not-an-email>' : settings[key],
    );

    await expect(new NodemailerEmailSender(config).send(message)).rejects.toThrow(
      'MAIL_FROM must be a valid email address',
    );
  });

  it.each([['SMTP_USER', 'user'], ['SMTP_PASSWORD', 'password']])(
    'rejects incomplete SMTP credentials when only %s is provided',
    async (key, value) => {
      (config.get as jest.Mock).mockImplementation((asked: string) =>
        asked === key ? value : settings[asked],
      );

      await expect(new NodemailerEmailSender(config).send(message)).rejects.toThrow(
        'SMTP_USER and SMTP_PASSWORD must both be provided',
      );
    },
  );

  it('trims settings and sends SMTP credentials when both are configured', async () => {
    (config.get as jest.Mock).mockImplementation(
      (key: string) =>
        ({
          SMTP_HOST: ' smtp.example.com ',
          SMTP_PORT: ' 465 ',
          SMTP_SECURE: ' true ',
          SMTP_USER: ' user ',
          SMTP_PASSWORD: ' password ',
          MAIL_FROM: ' oficina@example.com ',
        })[key],
    );

    await new NodemailerEmailSender(config).send(message);

    expect(mockCreateTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      auth: { user: 'user', pass: 'password' },
    });
    expect(mockSendMail).toHaveBeenCalledWith({
      from: 'oficina@example.com',
      ...message,
    });
  });
});
