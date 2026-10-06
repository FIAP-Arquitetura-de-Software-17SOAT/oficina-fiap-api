import {
  isValidLoginEmail,
  isValidLoginPassword,
  normalizeLoginEmail,
} from './login-credentials';

describe('login credentials', () => {
  it('normalizes the e-mail and validates its shape', () => {
    expect(normalizeLoginEmail('  Admin@Example.com ')).toBe(
      'admin@example.com',
    );
    expect(isValidLoginEmail('admin@example.com')).toBe(true);
    expect(isValidLoginEmail('not-an-email')).toBe(false);
    expect(isValidLoginEmail(42)).toBe(false);
  });

  it('bounds the password by characters and by bcrypt bytes', () => {
    expect(isValidLoginPassword('short')).toBe(false);
    expect(isValidLoginPassword('correct-horse-battery-staple')).toBe(true);
    expect(isValidLoginPassword('ç'.repeat(40))).toBe(false);
    expect(isValidLoginPassword(null)).toBe(false);
  });
});
