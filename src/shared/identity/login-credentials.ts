import { isEmail, length } from 'class-validator';

export const LOGIN_PASSWORD_MIN_CHARACTERS = 8;
export const LOGIN_PASSWORD_MAX_CHARACTERS = 72;
export const BCRYPT_PASSWORD_MAX_BYTES = 72;

export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidLoginEmail(value: unknown): value is string {
  return isEmail(value);
}

export function isValidLoginPassword(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    length(
      value,
      LOGIN_PASSWORD_MIN_CHARACTERS,
      LOGIN_PASSWORD_MAX_CHARACTERS,
    ) &&
    Buffer.byteLength(value, 'utf8') <= BCRYPT_PASSWORD_MAX_BYTES
  );
}
