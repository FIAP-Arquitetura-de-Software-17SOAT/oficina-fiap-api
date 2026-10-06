import { readJwtSettings } from './jwt-settings';

const ACCESS_SECRET = 'access-secret-for-tests';
const REFRESH_SECRET = 'refresh-secret-for-tests';

const config = (values: Record<string, string | undefined>) =>
  ({ get: (key: string) => values[key] }) as never;

describe('readJwtSettings', () => {
  it.each([
    [
      'a missing access secret',
      {
        JWT_ACCESS_TTL: '15m',
        JWT_REFRESH_SECRET: REFRESH_SECRET,
        JWT_REFRESH_TTL: '7d',
      },
    ],
    [
      'an invalid refresh TTL',
      {
        JWT_ACCESS_SECRET: ACCESS_SECRET,
        JWT_ACCESS_TTL: '15m',
        JWT_REFRESH_SECRET: REFRESH_SECRET,
        JWT_REFRESH_TTL: 'never',
      },
    ],
    [
      'equal secrets',
      {
        JWT_ACCESS_SECRET: ACCESS_SECRET,
        JWT_ACCESS_TTL: '15m',
        JWT_REFRESH_SECRET: ACCESS_SECRET,
        JWT_REFRESH_TTL: '7d',
      },
    ],
  ])('rejects %s in JWT configuration', (_label, values) => {
    expect(() => readJwtSettings(config(values))).toThrow();
  });

  it.each([
    ['change-me-access-secret', `${'r'.repeat(32)}-refresh`],
    [`${'a'.repeat(32)}-access`, 'change-me-refresh-secret'],
  ])(
    'rejects legacy placeholder JWT secrets in production',
    (accessSecret, refreshSecret) => {
      expect(() =>
        readJwtSettings(
          config({
            NODE_ENV: 'production',
            JWT_ACCESS_SECRET: accessSecret,
            JWT_ACCESS_TTL: '15m',
            JWT_REFRESH_SECRET: refreshSecret,
            JWT_REFRESH_TTL: '7d',
          }),
        ),
      ).toThrow('must not use a known placeholder in production');
    },
  );

  it.each([
    ['access', 'a'.repeat(31), `${'r'.repeat(32)}-refresh`],
    ['refresh', `${'a'.repeat(32)}-access`, 'r'.repeat(31)],
  ])(
    'rejects a production %s secret below 32 UTF-8 bytes',
    (_case, accessSecret, refreshSecret) => {
      expect(() =>
        readJwtSettings(
          config({
            NODE_ENV: 'production',
            JWT_ACCESS_SECRET: accessSecret,
            JWT_ACCESS_TTL: '15m',
            JWT_REFRESH_SECRET: refreshSecret,
            JWT_REFRESH_TTL: '7d',
          }),
        ),
      ).toThrow('must be at least 32 UTF-8 bytes in production');
    },
  );

  it('accepts distinct 32-byte JWT secrets in production', () => {
    const accessSecret = 'aB3dE5fG7hJ9kL2mN4pQ6rS8tU0vW1xy';
    const refreshSecret = 'zY8xW6vU4tS2rQ0pN9mL7kJ5hG3fE1dC';

    expect(Buffer.byteLength(accessSecret, 'utf8')).toBe(32);
    expect(Buffer.byteLength(refreshSecret, 'utf8')).toBe(32);
    expect(
      readJwtSettings(
        config({
          NODE_ENV: 'production',
          JWT_ACCESS_SECRET: accessSecret,
          JWT_ACCESS_TTL: '15m',
          JWT_REFRESH_SECRET: refreshSecret,
          JWT_REFRESH_TTL: '7d',
        }),
      ),
    ).toMatchObject({ accessSecret, refreshSecret });
  });

  it.each([
    ['a sub-second access TTL', '999ms', '7d'],
    ['a non-whole-second refresh TTL', '15m', '1500ms'],
    ['an overflowing access TTL', '9007199254740992s', '7d'],
    ['a refresh TTL outside the Date TimeClip range', '15m', '280000y'],
  ])('rejects %s', (_label, accessTtl, refreshTtl) => {
    expect(() =>
      readJwtSettings(
        config({
          JWT_ACCESS_SECRET: ACCESS_SECRET,
          JWT_ACCESS_TTL: accessTtl,
          JWT_REFRESH_SECRET: REFRESH_SECRET,
          JWT_REFRESH_TTL: refreshTtl,
        }),
      ),
    ).toThrow();
  });
});
