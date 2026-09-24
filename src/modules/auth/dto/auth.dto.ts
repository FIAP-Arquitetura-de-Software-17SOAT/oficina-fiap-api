import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsLoginPassword,
  normalizeLoginEmail,
} from '../../../shared/identity/login-credentials';

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
