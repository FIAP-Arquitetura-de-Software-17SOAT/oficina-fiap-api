/** Hash lento para senhas e para o digest do refresh token. */
export abstract class PasswordHasherPort {
  abstract hash(value: string): Promise<string>;
  abstract compare(value: string, valueHash: string): Promise<boolean>;
}
