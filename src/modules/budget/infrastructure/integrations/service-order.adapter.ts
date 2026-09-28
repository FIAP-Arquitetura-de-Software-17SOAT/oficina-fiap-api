import { Injectable } from '@nestjs/common';
import { ServiceOrderApplicationError } from '../../../service-order/application/errors/service-order-application.error';
import { AwaitApprovalUseCase } from '../../../service-order/application/use-cases/await-approval.use-case';
import { AwaitPartsUseCase } from '../../../service-order/application/use-cases/await-parts.use-case';
import { FindServiceOrderUseCase } from '../../../service-order/application/use-cases/find-service-order.use-case';
import {
  ServiceOrderPort,
  ServiceOrderSummary,
} from '../../application/ports/service-order.port';

@Injectable()
export class ServiceOrderAdapter implements ServiceOrderPort {
  constructor(
    private readonly findServiceOrder: FindServiceOrderUseCase,
    private readonly awaitApprovalUseCase: AwaitApprovalUseCase,
    private readonly awaitPartsUseCase: AwaitPartsUseCase,
  ) {}

  async findById(serviceOrderId: string): Promise<ServiceOrderSummary | null> {
    try {
      const serviceOrder = await this.findServiceOrder.execute(serviceOrderId);
      return {
        id: serviceOrder.getId(),
        clientId: serviceOrder.getClientId(),
        status: serviceOrder.getStatus(),
      };
    } catch (error) {
      if (
        error instanceof ServiceOrderApplicationError &&
        error.code === 'SERVICE_ORDER_NOT_FOUND'
      ) {
        return null;
      }
      throw error;
    }
  }

  async awaitApproval(serviceOrderId: string): Promise<void> {
    await this.awaitApprovalUseCase.execute(serviceOrderId);
  }

  async awaitParts(serviceOrderId: string): Promise<void> {
    await this.awaitPartsUseCase.execute(serviceOrderId);
  }
}
