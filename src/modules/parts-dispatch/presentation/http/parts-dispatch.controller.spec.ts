import { DispatchPartsForServiceOrderUseCase } from '../../application/use-cases/dispatch-parts-for-service-order.use-case';
import { PartsDispatchController } from './parts-dispatch.controller';

describe('PartsDispatchController', () => {
  it('delegates the service order id to the use case and returns its result', async () => {
    const execute = jest.fn().mockResolvedValue({
      serviceOrderId: 'so-1',
      dispatched: true,
      purchaseOrderId: null,
      requirements: [],
    });
    const controller = new PartsDispatchController({
      execute,
    } as unknown as DispatchPartsForServiceOrderUseCase);

    await expect(controller.dispatchServiceOrderParts('so-1')).resolves.toEqual(
      {
        serviceOrderId: 'so-1',
        dispatched: true,
        purchaseOrderId: null,
        requirements: [],
      },
    );
    expect(execute).toHaveBeenCalledWith('so-1');
  });
});
