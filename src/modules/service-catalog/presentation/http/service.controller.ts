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
import { Role } from '../../../../../generated/prisma/enums';
import { Roles } from '../../../../shared/http/auth/roles.decorator';
import {
  CreateServiceDto,
  ServiceResponseDto,
  UpdateServiceDto,
} from './dto/service.dto';
import { ServiceResponseMapper } from './mappers/service-response.mapper';
import { CreateServiceUseCase } from '../../application/use-cases/create-service.use-case';
import { FindServiceUseCase } from '../../application/use-cases/find-service.use-case';
import { ListServicesUseCase } from '../../application/use-cases/list-services.use-case';
import { UpdateServiceUseCase } from '../../application/use-cases/update-service.use-case';
import { DeleteServiceUseCase } from '../../application/use-cases/delete-service.use-case';

@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Roles(Role.ADMIN, Role.EMPLOYEE)
@ApiTags('services')
@Controller('services')
export class ServiceController {
  constructor(
    private readonly createService: CreateServiceUseCase,
    private readonly findService: FindServiceUseCase,
    private readonly listServices: ListServicesUseCase,
    private readonly updateService: UpdateServiceUseCase,
    private readonly deleteService: DeleteServiceUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Cadastra um serviço no catálogo' })
  @ApiCreatedResponse({ type: ServiceResponseDto })
  @ApiBadRequestResponse({ description: 'Nome ou preço inválido' })
  @ApiConflictResponse({ description: 'Service already exists' })
  async create(@Body() dto: CreateServiceDto): Promise<ServiceResponseDto> {
    return ServiceResponseMapper.toResponse(
      await this.createService.execute(dto),
    );
  }

  @Get()
  @ApiOperation({ summary: 'Lista os serviços do catálogo' })
  @ApiOkResponse({ type: ServiceResponseDto, isArray: true })
  async findAll(): Promise<ServiceResponseDto[]> {
    return ServiceResponseMapper.toResponseList(
      await this.listServices.execute(),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca um serviço por id' })
  @ApiOkResponse({ type: ServiceResponseDto })
  @ApiNotFoundResponse({ description: 'Service not found' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ServiceResponseDto> {
    return ServiceResponseMapper.toResponse(await this.findService.execute(id));
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
    return ServiceResponseMapper.toResponse(
      await this.updateService.execute(id, dto),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove um serviço do catálogo' })
  @ApiNoContentResponse({ description: 'Serviço removido' })
  @ApiNotFoundResponse({ description: 'Service not found' })
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.deleteService.execute(id);
  }
}
