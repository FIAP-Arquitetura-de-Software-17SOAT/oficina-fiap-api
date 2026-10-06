import { Injectable } from '@nestjs/common';
import { ServiceOrderApplicationError } from '../../../service-order/application/errors/service-order-application.error';
import { AwaitPaymentUseCase } from '../../../service-order/application/use-cases/await-payment.use-case';
import { DeliverServiceOrderUseCase } from '../../../service-order/application/use-cases/deliver-service-order.use-case';
import { FindServiceOrderUseCase } from '../../../service-order/application/use-cases/find-service-order.use-case';
import { ServiceOrder } from '../../../service-order/domain/entities/service-order.entity';
import {
  ServiceOrderPort,
  ServiceOrderSummary,
} from '../../application/ports/service-order.port';

@Injectable()
export class ServiceOrderAdapter implements ServiceOrderPort {
  constructor(
    private readonly findServiceOrder: FindServiceOrderUseCase,
    private readonly awaitPaymentUseCase: AwaitPaymentUseCase,
    private readonly deliverUseCase: DeliverServiceOrderUseCase,
  ) {}

  async findById(serviceOrderId: string): Promise<ServiceOrderSummary | null> {
    try {
      return summarize(await this.findServiceOrder.execute(serviceOrderId));
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

  async awaitPayment(serviceOrderId: string): Promise<ServiceOrderSummary> {
    return summarize(await this.awaitPaymentUseCase.execute(serviceOrderId));
  }

  async deliver(serviceOrderId: string): Promise<ServiceOrderSummary> {
    return summarize(await this.deliverUseCase.execute(serviceOrderId));
  }
}

function summarize(serviceOrder: ServiceOrder): ServiceOrderSummary {
  return {
    id: serviceOrder.getId(),
    clientId: serviceOrder.getClientId(),
    status: serviceOrder.getStatus(),
  };
}
