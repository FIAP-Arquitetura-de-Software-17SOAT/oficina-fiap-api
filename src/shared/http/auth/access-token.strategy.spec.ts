import { UnauthorizedException } from '@nestjs/common';
import { AccessTokenStrategy } from './access-token.strategy';

describe('AccessTokenStrategy', () => {
  const strategy = new AccessTokenStrategy({
    get: (key: string) =>
      key === 'JWT_ACCESS_SECRET' ? 'unit-access-secret' : undefined,
  } as never);

  it('projects a valid access token to the current user contract', () => {
    expect(
      strategy.validate({
        sub: 'admin-id',
        role: 'ADMIN',
        type: 'access',
        jti: 'access-jti',
        iat: 1,
        exp: 2,
      }),
    ).toEqual({ id: 'admin-id', role: 'ADMIN' });
  });

  it('rejects a refresh-typed token even if its signature was accepted', () => {
    expect(() =>
      strategy.validate({
        sub: 'admin-id',
        role: 'ADMIN',
        type: 'refresh',
        jti: 'refresh-jti',
        iat: 1,
        exp: 2,
      }),
    ).toThrow(UnauthorizedException);
  });

  it.each([
    [
      'a missing subject',
      { role: 'ADMIN', type: 'access', jti: 'jti', iat: 1, exp: 2 },
    ],
    [
      'a missing role',
      { sub: 'admin-id', type: 'access', jti: 'jti', iat: 1, exp: 2 },
    ],
    [
      'a missing token id',
      { sub: 'admin-id', role: 'ADMIN', type: 'access', iat: 1, exp: 2 },
    ],
    [
      'a missing issued-at timestamp',
      {
        sub: 'admin-id',
        role: 'ADMIN',
        type: 'access',
        jti: 'jti',
        exp: 2,
      },
    ],
    [
      'a missing expiry timestamp',
      {
        sub: 'admin-id',
        role: 'ADMIN',
        type: 'access',
        jti: 'jti',
        iat: 1,
      },
    ],
  ])('rejects %s', (_case, payload) => {
    expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
  });

  it('fails fast when the access-token secret is absent', () => {
    expect(
      () => new AccessTokenStrategy({ get: () => undefined } as never),
    ).toThrow('JWT_ACCESS_SECRET is required');
  });
});
