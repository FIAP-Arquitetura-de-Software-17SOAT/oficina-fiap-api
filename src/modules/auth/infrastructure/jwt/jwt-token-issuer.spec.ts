import { JwtService } from '@nestjs/jwt';
import { JwtTokenIssuer } from './jwt-token-issuer';

const ACCESS_SECRET = 'access-secret-for-tests';
const REFRESH_SECRET = 'refresh-secret-for-tests';

describe('JwtTokenIssuer', () => {
  const jwt = new JwtService({ secret: ACCESS_SECRET });
  const issuer = new JwtTokenIssuer(jwt, {
    get: (key: string) =>
      (
        ({
          JWT_ACCESS_SECRET: ACCESS_SECRET,
          JWT_ACCESS_TTL: '15m',
          JWT_REFRESH_SECRET: REFRESH_SECRET,
          JWT_REFRESH_TTL: '7d',
        }) as Record<string, string>
      )[key],
  } as never);
  const claims = { sub: 'u', role: 'ADMIN' as const, jti: 'j' };

  it('signs access and refresh tokens with their own secrets', async () => {
    const access = await issuer.sign({ ...claims, type: 'access' });
    const refresh = await issuer.sign({ ...claims, type: 'refresh' });

    await expect(
      jwt.verifyAsync(access, { secret: ACCESS_SECRET }),
    ).resolves.toMatchObject({ type: 'access' });
    await expect(
      jwt.verifyAsync(refresh, { secret: REFRESH_SECRET }),
    ).resolves.toMatchObject({ type: 'refresh' });
    await expect(issuer.verifyRefresh(refresh)).resolves.toMatchObject({
      sub: 'u',
      exp: expect.any(Number),
    });
  });

  it('answers null for a token signed with the access secret or garbage', async () => {
    const access = await issuer.sign({ ...claims, type: 'access' });

    await expect(issuer.verifyRefresh(access)).resolves.toBeNull();
    await expect(issuer.verifyRefresh('not-a-token')).resolves.toBeNull();
  });
});
