import { RefreshSession } from './refresh-session.entity';

describe('RefreshSession', () => {
  it('marks a session as revoked at the supplied time', () => {
    const session = RefreshSession.restore('session-id', {
      jti: 'session-jti',
      tokenHash: '$2b$12$hash',
      expiresAt: new Date('2026-08-14T12:00:00.000Z'),
      userId: 'user-id',
      createdAt: new Date('2026-08-13T12:00:00.000Z'),
      updatedAt: new Date('2026-08-13T12:00:00.000Z'),
    });
    const revokedAt = new Date('2026-08-13T13:00:00.000Z');

    session.revoke(revokedAt);

    expect(session.isRevoked()).toBe(true);
    expect(session.getRevokedAt()).toEqual(revokedAt);
  });

  it('is expired at or after its expiration time', () => {
    const expiresAt = new Date('2026-08-14T12:00:00.000Z');
    const session = RefreshSession.restore('session-id', {
      jti: 'session-jti',
      tokenHash: '$2b$12$hash',
      expiresAt,
      userId: 'user-id',
      createdAt: new Date('2026-08-13T12:00:00.000Z'),
      updatedAt: new Date('2026-08-13T12:00:00.000Z'),
    });

    expect(session.isExpired(expiresAt)).toBe(true);
    expect(session.isExpired(new Date('2026-08-14T11:59:59.999Z'))).toBe(false);
  });
});
