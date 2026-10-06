import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  ClientResponseDto,
  CreateClientDto,
  UpdateClientDto,
} from './dto/client.dto';
import {
  ClientAccountResponseDto,
  CreateClientAccountDto,
} from './dto/client-account.dto';
import { ClientResponseMapper } from './mappers/client-response.mapper';
import { CreateClientUseCase } from '../../application/use-cases/create-client.use-case';
import { FindClientUseCase } from '../../application/use-cases/find-client.use-case';
import { ListClientsUseCase } from '../../application/use-cases/list-clients.use-case';
import { UpdateClientUseCase } from '../../application/use-cases/update-client.use-case';
import { DeleteClientUseCase } from '../../application/use-cases/delete-client.use-case';
import { CreateClientAccountUseCase } from '../../application/use-cases/create-client-account.use-case';
import { Role } from '../../../../../generated/prisma/enums';
import { Roles } from '../../../../shared/http/auth/roles.decorator';

@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Roles(Role.ADMIN, Role.EMPLOYEE)
@ApiTags('clients')
@Controller('clients')
export class ClientController {
  constructor(
    private readonly createClient: CreateClientUseCase,
    private readonly findClient: FindClientUseCase,
    private readonly listClients: ListClientsUseCase,
    private readonly updateClient: UpdateClientUseCase,
    private readonly deleteClient: DeleteClientUseCase,
    private readonly createClientAccount: CreateClientAccountUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Cadastra um cliente' })
  @ApiCreatedResponse({ type: ClientResponseDto })
  @ApiBadRequestResponse({
    description: 'CPF/CNPJ, e-mail ou telefone inválido',
  })
  @ApiConflictResponse({ description: 'Client already exists' })
  async create(@Body() dto: CreateClientDto): Promise<ClientResponseDto> {
    return ClientResponseMapper.toResponse(
      await this.createClient.execute(dto),
    );
  }

  @Get()
  @ApiOperation({ summary: 'Lista os clientes' })
  @ApiOkResponse({ type: ClientResponseDto, isArray: true })
  async findAll(): Promise<ClientResponseDto[]> {
    return ClientResponseMapper.toResponseList(
      await this.listClients.execute(),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca um cliente por id' })
  @ApiOkResponse({ type: ClientResponseDto })
  @ApiNotFoundResponse({ description: 'Client not found' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ClientResponseDto> {
    return ClientResponseMapper.toResponse(await this.findClient.execute(id));
  }

  @Post(':id/account')
  @ApiOperation({
    summary: 'Cria o login do cliente (papel CUSTOMER)',
    description:
      'O email do login é o do cadastro do cliente. Com ele o cliente ' +
      'acompanha as próprias OS e aprova ou recusa o orçamento.',
  })
  @ApiCreatedResponse({ type: ClientAccountResponseDto })
  @ApiBadRequestResponse({ description: 'Senha inválida' })
  @ApiNotFoundResponse({ description: 'Client not found' })
  @ApiConflictResponse({
    description: 'O cliente já tem login, ou o email já é de outro login',
  })
  async createAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateClientAccountDto,
  ): Promise<ClientAccountResponseDto> {
    return this.createClientAccount.execute(id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza um cliente' })
  @ApiOkResponse({ type: ClientResponseDto })
  @ApiBadRequestResponse({ description: 'E-mail ou telefone inválido' })
  @ApiNotFoundResponse({ description: 'Client not found' })
  @ApiConflictResponse({ description: 'E-mail already in use' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
  ): Promise<ClientResponseDto> {
    return ClientResponseMapper.toResponse(
      await this.updateClient.execute(id, dto),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove um cliente' })
  @ApiNoContentResponse({ description: 'Cliente removido' })
  @ApiNotFoundResponse({ description: 'Client not found' })
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.deleteClient.execute(id);
  }
}
