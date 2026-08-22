import { Billing } from '../entities/billing.entity';
import { PaymentMethod } from '../enums/payment-method.enum';
import { BillingService } from '../services/billing.service';
import { BillingController } from './billing.controller';

const serviceOrderId = 'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c';

describe('BillingController', () => {
  let service: jest.Mocked<BillingService>;
  let controller: BillingController;

  beforeEach(() => {
    service = {
      generateForServiceOrder: jest.fn(),
      findById: jest.fn(),
      findByServiceOrderId: jest.fn(),
      findAll: jest.fn(),
      registerPayment: jest.fn(),
      cancel: jest.fn(),
      deliverServiceOrder: jest.fn(),
    } as unknown as jest.Mocked<BillingService>;
    controller = new BillingController(service);
  });

  it('generates billing', async () => {
    const billing = Billing.create({ serviceOrderId, totalAmountInCents: 12000 });
    service.generateForServiceOrder.mockResolvedValue(billing);

    const response = await controller.generate({ serviceOrderId });

    expect(service.generateForServiceOrder).toHaveBeenCalledWith({
      serviceOrderId,
    });
    expect(response.totalAmount).toBe(120);
  });

  it('lists all billings when no serviceOrderId query is provided', async () => {
    service.findAll.mockResolvedValue([]);

    await expect(controller.findAll({})).resolves.toEqual([]);
    expect(service.findAll).toHaveBeenCalled();
  });

  it('finds by serviceOrderId when query is provided', async () => {
    const billing = Billing.create({ serviceOrderId, totalAmountInCents: 12000 });
    service.findByServiceOrderId.mockResolvedValue(billing);

    const response = await controller.findAll({ serviceOrderId });

    expect(response).toHaveLength(1);
    expect(service.findByServiceOrderId).toHaveBeenCalledWith(serviceOrderId);
  });

  it('registers payment', async () => {
    const billing = Billing.create({ serviceOrderId, totalAmountInCents: 12000 });
    service.registerPayment.mockResolvedValue(billing);

    await controller.registerPayment(billing.getId(), {
      amount: 50,
      method: PaymentMethod.PIX,
    });

    expect(service.registerPayment).toHaveBeenCalledWith(billing.getId(), {
      amount: 50,
      method: PaymentMethod.PIX,
    });
  });

  it('delivers service order and returns void', async () => {
    service.deliverServiceOrder.mockResolvedValue(undefined);

    await expect(controller.deliverServiceOrder(serviceOrderId)).resolves.toBeUndefined();
  });
});
