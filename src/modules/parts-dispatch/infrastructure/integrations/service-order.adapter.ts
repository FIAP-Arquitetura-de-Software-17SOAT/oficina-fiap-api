import { Injectable } from '@nestjs/common';
import { ServiceOrderService } from '../../../service-order/services/service-order.service';
import { ServiceOrderDispatchPort } from '../../application/ports/service-order-dispatch.port';

@Injectable()
export class ServiceOrderAdapter implements ServiceOrderDispatchPort {
  constructor(private readonly serviceOrders: ServiceOrderService) {}

  async registerPartsDispatched(serviceOrderId: string): Promise<void> {
    await this.serviceOrders.registerPartsDispatched(serviceOrderId);
  }
}
