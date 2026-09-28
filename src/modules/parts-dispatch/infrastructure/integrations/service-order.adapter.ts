import { Injectable } from '@nestjs/common';
import { RegisterPartsDispatchedUseCase } from '../../../service-order/application/use-cases/register-parts-dispatched.use-case';
import { ServiceOrderDispatchPort } from '../../application/ports/service-order-dispatch.port';

@Injectable()
export class ServiceOrderAdapter implements ServiceOrderDispatchPort {
  constructor(
    private readonly registerPartsDispatchedUseCase: RegisterPartsDispatchedUseCase,
  ) {}

  async registerPartsDispatched(serviceOrderId: string): Promise<void> {
    await this.registerPartsDispatchedUseCase.execute(serviceOrderId);
  }
}
