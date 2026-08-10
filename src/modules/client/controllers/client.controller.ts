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
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ClientResponseDto,
  CreateClientDto,
  UpdateClientDto,
} from '../dto/client.dto';
import { ClientMapper } from '../mappers/client.mapper';
import { ClientService } from '../services/client.service';

@ApiTags('client')
@Controller('client')
export class ClientController {
  constructor(private readonly clientService: ClientService) {}

  @Post()
  @ApiOperation({ summary: 'Cadastra um cliente' })
  @ApiCreatedResponse({ type: ClientResponseDto })
  @ApiBadRequestResponse({
    description: 'CPF/CNPJ, e-mail ou telefone inválido',
  })
  @ApiConflictResponse({ description: 'Client already exists' })
  async create(@Body() dto: CreateClientDto): Promise<ClientResponseDto> {
    return ClientMapper.toResponse(await this.clientService.create(dto));
  }

  @Get()
  @ApiOperation({ summary: 'Lista os clientes' })
  @ApiOkResponse({ type: ClientResponseDto, isArray: true })
  async findAll(): Promise<ClientResponseDto[]> {
    return ClientMapper.toResponseList(await this.clientService.findAll());
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca um cliente por id' })
  @ApiOkResponse({ type: ClientResponseDto })
  @ApiNotFoundResponse({ description: 'Client not found' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ClientResponseDto> {
    return ClientMapper.toResponse(await this.clientService.findById(id));
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
    return ClientMapper.toResponse(await this.clientService.update(id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove um cliente' })
  @ApiNoContentResponse({ description: 'Cliente removido' })
  @ApiNotFoundResponse({ description: 'Client not found' })
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.clientService.delete(id);
  }
}
