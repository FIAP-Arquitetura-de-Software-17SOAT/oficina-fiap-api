import { Transform } from 'class-transformer';
import {
  buildMessage,
  IsEmail,
  IsNotEmpty,
  IsString,
  ValidateBy,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  BCRYPT_PASSWORD_MAX_BYTES,
  isValidLoginPassword,
  LOGIN_PASSWORD_MAX_CHARACTERS,
  LOGIN_PASSWORD_MIN_CHARACTERS,
  normalizeLoginEmail,
} from '../../../shared/identity/login-credentials';

const IsLoginPassword = (): PropertyDecorator =>
  ValidateBy({
    name: 'isLoginPassword',
    validator: {
      validate: isValidLoginPassword,
      defaultMessage: buildMessage(
        (eachPrefix) =>
          `${eachPrefix}$property must be ${LOGIN_PASSWORD_MIN_CHARACTERS} to ${LOGIN_PASSWORD_MAX_CHARACTERS} characters and at most ${BCRYPT_PASSWORD_MAX_BYTES} UTF-8 bytes`,
      ),
    },
  });

export class LoginDto {
  @ApiProperty({ example: 'admin@example.com' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeLoginEmail(value) : value,
  )
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'correct-horse-battery-staple',
    minLength: 8,
    maxLength: 72,
  })
  @IsLoginPassword()
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class TokenPairDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;
}
