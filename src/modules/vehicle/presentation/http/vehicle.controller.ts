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
  Query,
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
  CreateVehicleDto,
  ListVehicleQueryDto,
  UpdateVehicleDto,
  VehicleResponseDto,
} from './dto/vehicle.dto';
import { VehicleResponseMapper } from './mappers/vehicle-response.mapper';
import { CreateVehicleUseCase } from '../../application/use-cases/create-vehicle.use-case';
import { FindVehicleUseCase } from '../../application/use-cases/find-vehicle.use-case';
import { ListVehiclesUseCase } from '../../application/use-cases/list-vehicles.use-case';
import { UpdateVehicleUseCase } from '../../application/use-cases/update-vehicle.use-case';
import { DeleteVehicleUseCase } from '../../application/use-cases/delete-vehicle.use-case';
import { Role } from '../../../../../generated/prisma/enums';
import { Roles } from '../../../../shared/http/auth/roles.decorator';

@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Roles(Role.ADMIN, Role.EMPLOYEE)
@ApiTags('vehicles')
@Controller('vehicles')
export class VehicleController {
  constructor(
    private readonly createVehicle: CreateVehicleUseCase,
    private readonly findVehicle: FindVehicleUseCase,
    private readonly listVehicles: ListVehiclesUseCase,
    private readonly updateVehicle: UpdateVehicleUseCase,
    private readonly deleteVehicle: DeleteVehicleUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Cadastra um veículo' })
  @ApiCreatedResponse({ type: VehicleResponseDto })
  @ApiBadRequestResponse({ description: 'Placa ou ano inválido' })
  @ApiNotFoundResponse({ description: 'Client not found' })
  @ApiConflictResponse({ description: 'Vehicle already exists' })
  async create(@Body() dto: CreateVehicleDto): Promise<VehicleResponseDto> {
    return VehicleResponseMapper.toResponse(
      await this.createVehicle.execute(dto),
    );
  }

  @Get()
  @ApiOperation({ summary: 'Lista os veículos, opcionalmente de um cliente' })
  @ApiOkResponse({ type: VehicleResponseDto, isArray: true })
  @ApiNotFoundResponse({ description: 'Client not found' })
  async findAll(
    @Query() query: ListVehicleQueryDto,
  ): Promise<VehicleResponseDto[]> {
    return VehicleResponseMapper.toResponseList(
      await this.listVehicles.execute(query.clientId),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca um veículo por id' })
  @ApiOkResponse({ type: VehicleResponseDto })
  @ApiNotFoundResponse({ description: 'Vehicle not found' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VehicleResponseDto> {
    return VehicleResponseMapper.toResponse(await this.findVehicle.execute(id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza marca, modelo ou ano de um veículo' })
  @ApiOkResponse({ type: VehicleResponseDto })
  @ApiBadRequestResponse({ description: 'Ano inválido' })
  @ApiNotFoundResponse({ description: 'Vehicle not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleDto,
  ): Promise<VehicleResponseDto> {
    return VehicleResponseMapper.toResponse(
      await this.updateVehicle.execute(id, dto),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove um veículo' })
  @ApiNoContentResponse({ description: 'Veículo removido' })
  @ApiNotFoundResponse({ description: 'Vehicle not found' })
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.deleteVehicle.execute(id);
  }
}
