import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto, RefreshTokenDto } from './auth.dto';

describe('auth DTOs', () => {
  it('accepts a valid email and an 8-to-72-character password', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'admin@example.com',
      password: 'correct-password',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects an invalid email and a password outside the allowed bounds', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'not-an-email',
      password: 'short',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['email', 'password']),
    );
  });

  it('accepts a password at the 72-byte UTF-8 bcrypt boundary', async () => {
    const password = `${'é'.repeat(32)}12345678`;
    const dto = plainToInstance(LoginDto, {
      email: 'admin@example.com',
      password,
    });

    expect(Buffer.byteLength(password, 'utf8')).toBe(72);
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects a password over the 72-byte UTF-8 bcrypt boundary', async () => {
    const password = `${'é'.repeat(32)}123456789`;
    const dto = plainToInstance(LoginDto, {
      email: 'admin@example.com',
      password,
    });

    expect(Buffer.byteLength(password, 'utf8')).toBe(73);
    expect((await validate(dto)).map((error) => error.property)).toContain(
      'password',
    );
  });

  it('requires a refresh token body value', async () => {
    const dto = plainToInstance(RefreshTokenDto, {});

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('refreshToken');
  });
});
