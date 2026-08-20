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
  CreateVehicleDto,
  ListVehicleQueryDto,
  UpdateVehicleDto,
  VehicleResponseDto,
} from '../dto/vehicle.dto';
import { VehicleMapper } from '../mappers/vehicle.mapper';
import { VehicleService } from '../services/vehicle.service';

@ApiTags('vehicle')
@Controller('vehicle')
export class VehicleController {
  constructor(private readonly vehicleService: VehicleService) {}

  @Post()
  @ApiOperation({ summary: 'Cadastra um veículo' })
  @ApiCreatedResponse({ type: VehicleResponseDto })
  @ApiBadRequestResponse({ description: 'Placa ou ano inválido' })
  @ApiNotFoundResponse({ description: 'Client not found' })
  @ApiConflictResponse({ description: 'Vehicle already exists' })
  async create(@Body() dto: CreateVehicleDto): Promise<VehicleResponseDto> {
    return VehicleMapper.toResponse(await this.vehicleService.create(dto));
  }

  @Get()
  @ApiOperation({ summary: 'Lista os veículos, opcionalmente de um cliente' })
  @ApiOkResponse({ type: VehicleResponseDto, isArray: true })
  @ApiNotFoundResponse({ description: 'Client not found' })
  async findAll(
    @Query() query: ListVehicleQueryDto,
  ): Promise<VehicleResponseDto[]> {
    return VehicleMapper.toResponseList(
      await this.vehicleService.findAll(query.clientId),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca um veículo por id' })
  @ApiOkResponse({ type: VehicleResponseDto })
  @ApiNotFoundResponse({ description: 'Vehicle not found' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VehicleResponseDto> {
    return VehicleMapper.toResponse(await this.vehicleService.findById(id));
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
    return VehicleMapper.toResponse(await this.vehicleService.update(id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove um veículo' })
  @ApiNoContentResponse({ description: 'Veículo removido' })
  @ApiNotFoundResponse({ description: 'Vehicle not found' })
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.vehicleService.delete(id);
  }
}
