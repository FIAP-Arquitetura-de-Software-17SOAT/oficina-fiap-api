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
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Role } from '../../../../generated/prisma/enums';
import { Roles } from '../../../shared/http/auth/roles.decorator';
import {
  CreateServiceDto,
  ServiceResponseDto,
  UpdateServiceDto,
} from '../dto/service.dto';
import { ServiceMapper } from '../mappers/service.mapper';
import { ServiceCatalogService } from '../services/service-catalog.service';

@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Roles(Role.ADMIN, Role.EMPLOYEE)
@ApiTags('services')
@Controller('services')
export class ServiceController {
  constructor(private readonly serviceCatalog: ServiceCatalogService) {}

  @Post()
  @ApiOperation({ summary: 'Cadastra um serviço no catálogo' })
  @ApiCreatedResponse({ type: ServiceResponseDto })
  @ApiBadRequestResponse({ description: 'Nome ou preço inválido' })
  @ApiConflictResponse({ description: 'Service already exists' })
  async create(@Body() dto: CreateServiceDto): Promise<ServiceResponseDto> {
    return ServiceMapper.toResponse(await this.serviceCatalog.create(dto));
  }

  @Get()
  @ApiOperation({ summary: 'Lista os serviços do catálogo' })
  @ApiOkResponse({ type: ServiceResponseDto, isArray: true })
  async findAll(): Promise<ServiceResponseDto[]> {
    return ServiceMapper.toResponseList(await this.serviceCatalog.findAll());
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca um serviço por id' })
  @ApiOkResponse({ type: ServiceResponseDto })
  @ApiNotFoundResponse({ description: 'Service not found' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ServiceResponseDto> {
    return ServiceMapper.toResponse(await this.serviceCatalog.findById(id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza nome, descrição ou preço de um serviço' })
  @ApiOkResponse({ type: ServiceResponseDto })
  @ApiBadRequestResponse({ description: 'Nome ou preço inválido' })
  @ApiNotFoundResponse({ description: 'Service not found' })
  @ApiConflictResponse({ description: 'Service already exists' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceDto,
  ): Promise<ServiceResponseDto> {
    return ServiceMapper.toResponse(await this.serviceCatalog.update(id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove um serviço do catálogo' })
  @ApiNoContentResponse({ description: 'Serviço removido' })
  @ApiNotFoundResponse({ description: 'Service not found' })
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.serviceCatalog.delete(id);
  }
}
