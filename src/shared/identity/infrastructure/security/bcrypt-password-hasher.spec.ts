import { BcryptPasswordHasher } from './bcrypt-password-hasher';

describe('BcryptPasswordHasher', () => {
  const password = 'correct-horse-battery-staple';
  let service: BcryptPasswordHasher;

  beforeEach(() => {
    service = new BcryptPasswordHasher();
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
