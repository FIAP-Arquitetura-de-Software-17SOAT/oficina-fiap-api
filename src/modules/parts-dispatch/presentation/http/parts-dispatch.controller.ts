import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Role } from '../../../../../generated/prisma/enums';
import { Roles } from '../../../../shared/http/auth/roles.decorator';
import { DispatchPartsForServiceOrderUseCase } from '../../application/use-cases/dispatch-parts-for-service-order.use-case';
import { PartsDispatchResponseDto } from './dto/parts-dispatch.dto';

/**
 * Mantém a rota e a tag do PartController de onde o despacho saiu, para o
 * contrato HTTP e o Swagger continuarem idênticos.
 */
@ApiTags('parts')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token de acesso ausente ou inválido' })
@ApiForbiddenResponse({ description: 'Perfil autenticado não tem permissão' })
@Roles(Role.ADMIN, Role.EMPLOYEE)
@Controller('parts')
export class PartsDispatchController {
  constructor(
    private readonly dispatchParts: DispatchPartsForServiceOrderUseCase,
  ) {}

  @Post('service-orders/:serviceOrderId/dispatch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Consulta e baixa as peças do orçamento aceito de uma OS',
    description:
      'Havendo saldo, baixa as peças e move a OS para Em execução (IN_PROGRESS). ' +
      'Faltando peça, nada é baixado e um pedido de compra é aberto com a diferença.',
  })
  @ApiOkResponse({ type: PartsDispatchResponseDto })
  @ApiBadRequestResponse({
    description: 'OS sem orçamento aceito ou com item de peça sem referência',
  })
  @ApiNotFoundResponse({ description: 'Peça não encontrada' })
  @ApiConflictResponse({ description: 'Estoque insuficiente' })
  async dispatchServiceOrderParts(
    @Param('serviceOrderId', ParseUUIDPipe) serviceOrderId: string,
  ): Promise<PartsDispatchResponseDto> {
    return this.dispatchParts.execute(serviceOrderId);
  }
}
