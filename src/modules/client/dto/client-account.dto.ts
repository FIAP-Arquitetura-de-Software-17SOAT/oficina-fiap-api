import { ApiProperty } from '@nestjs/swagger';
import { IsLoginPassword } from '../../../shared/identity/login-credentials';

export class CreateClientAccountDto {
  @ApiProperty({
    example: 'correct-horse-battery-staple',
    minLength: 8,
    maxLength: 72,
    description: 'Senha do login do cliente. O email é o do cadastro.',
  })
  @IsLoginPassword()
  password: string;
}

export class ClientAccountResponseDto {
  @ApiProperty({ format: 'uuid', description: 'Id do usuário criado' })
  id: string;

  @ApiProperty({ example: 'maria@example.com' })
  email: string;

  @ApiProperty({ enum: ['CUSTOMER'] })
  role: string;

  @ApiProperty({ format: 'uuid' })
  clientId: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;
}
