import { Injectable } from '@nestjs/common';
import { compare, hash } from 'bcrypt';
import { PasswordHasherPort } from '../../application/ports/password-hasher.port';

const BCRYPT_SALT_ROUNDS = 12;

@Injectable()
export class BcryptPasswordHasher implements PasswordHasherPort {
  hash(value: string): Promise<string> {
    return hash(value, BCRYPT_SALT_ROUNDS);
  }

  compare(value: string, valueHash: string): Promise<boolean> {
    return compare(value, valueHash);
  }
}
