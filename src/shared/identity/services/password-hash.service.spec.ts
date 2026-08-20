import { PasswordHashService } from './password-hash.service';

describe('PasswordHashService', () => {
  const password = 'correct-horse-battery-staple';
  let service: PasswordHashService;

  beforeEach(() => {
    service = new PasswordHashService();
  });

  it('accepts the password used to create a hash', async () => {
    const hash = await service.hash(password);

    await expect(service.compare(password, hash)).resolves.toBe(true);
  });

  it('rejects a password that did not create the hash', async () => {
    const hash = await service.hash(password);

    await expect(service.compare('wrong-password', hash)).resolves.toBe(false);
  });
});
