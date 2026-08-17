import { DomainException } from '../../../shared/domain/domain.exception';
import { ServiceOrderStatus } from '../enums/service-order-status.enum';
import { ServiceOrder, ServiceOrderProps } from './service-order.entity';

const validProps = (
  overrides: Partial<ServiceOrderProps> = {},
): ServiceOrderProps => ({
  clientId: 'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
  vehicleId: 'a1b2c3d4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
  description: 'Barulho no motor',
  ...overrides,
});

describe('ServiceOrder', () => {
  describe('create', () => {
    it('gera um id novo', () => {
      const os = ServiceOrder.create(validProps());

      expect(os.getId()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('inicia com status RECEIVED', () => {
      const os = ServiceOrder.create(validProps());

      expect(os.getStatus()).toBe(ServiceOrderStatus.RECEIVED);
    });

    it('não tem motivo de cancelamento ao criar', () => {
      const os = ServiceOrder.create(validProps());

      expect(os.getCancellationReason()).toBeNull();
    });

    it('normaliza campos de texto', () => {
      const os = ServiceOrder.create(
        validProps({ description: '  Barulho no motor  ' }),
      );

      expect(os.getDescription()).toBe('Barulho no motor');
    });

    it('define createdAt e updatedAt quando não informados', () => {
      const os = ServiceOrder.create(validProps());

      expect(os.getCreatedAt()).toBeInstanceOf(Date);
      expect(os.getUpdatedAt()).toBeInstanceOf(Date);
    });
  });

  describe('invariantes', () => {
    it.each([
      [
        'clientId vazio',
        { clientId: '   ' },
        'Cliente da ordem de serviço é obrigatório',
      ],
      [
        'vehicleId vazio',
        { vehicleId: '' },
        'Veículo da ordem de serviço é obrigatório',
      ],
      [
        'description vazia',
        { description: '  ' },
        'Descrição da ordem de serviço é obrigatória',
      ],
    ])('recusa OS com %s', (_label, overrides, message) => {
      expect(() => ServiceOrder.create(validProps(overrides))).toThrow(message);
    });

    it('lança DomainException e não Error genérico', () => {
      expect(() =>
        ServiceOrder.create(validProps({ description: '' })),
      ).toThrow(DomainException);
    });
  });

  describe('restore', () => {
    it('recusa status desconhecido', () => {
      expect(() =>
        ServiceOrder.restore(
          'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
          validProps({ status: 'NOT_A_REAL_STATUS' as ServiceOrderStatus }),
        ),
      ).toThrow(DomainException);
    });

    it('preserva id, status e datas vindas do banco', () => {
      const createdAt = new Date('2026-01-01T10:00:00.000Z');
      const updatedAt = new Date('2026-02-01T10:00:00.000Z');

      const os = ServiceOrder.restore(
        'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        validProps({
          status: ServiceOrderStatus.IN_DIAGNOSIS,
          createdAt,
          updatedAt,
        }),
      );

      expect(os.getId()).toBe('f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c');
      expect(os.getStatus()).toBe(ServiceOrderStatus.IN_DIAGNOSIS);
      expect(os.getCreatedAt()).toBe(createdAt);
      expect(os.getUpdatedAt()).toBe(updatedAt);
    });
  });

  describe('transições de status', () => {
    const oldDate = new Date('2020-01-01T00:00:00.000Z');

    const restoredAt = (status: ServiceOrderStatus) =>
      ServiceOrder.restore(
        'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        validProps({ status, createdAt: oldDate, updatedAt: oldDate }),
      );

    it.each([
      [
        ServiceOrderStatus.RECEIVED,
        (os: ServiceOrder) => os.startDiagnosis(),
        ServiceOrderStatus.IN_DIAGNOSIS,
      ],
      [
        ServiceOrderStatus.IN_DIAGNOSIS,
        (os: ServiceOrder) => os.awaitApproval(),
        ServiceOrderStatus.AWAITING_APPROVAL,
      ],
      [
        ServiceOrderStatus.AWAITING_APPROVAL,
        (os: ServiceOrder) => os.awaitParts(),
        ServiceOrderStatus.AWAITING_PARTS,
      ],
      [
        ServiceOrderStatus.AWAITING_APPROVAL,
        (os: ServiceOrder) => os.startProgress(),
        ServiceOrderStatus.IN_PROGRESS,
      ],
      [
        ServiceOrderStatus.AWAITING_PARTS,
        (os: ServiceOrder) => os.startProgress(),
        ServiceOrderStatus.IN_PROGRESS,
      ],
      [
        ServiceOrderStatus.IN_PROGRESS,
        (os: ServiceOrder) => os.complete(),
        ServiceOrderStatus.COMPLETED,
      ],
      [
        ServiceOrderStatus.COMPLETED,
        (os: ServiceOrder) => os.deliver(),
        ServiceOrderStatus.DELIVERED,
      ],
    ])('permite transição válida a partir de %s', (from, act, expected) => {
      const os = restoredAt(from);

      act(os);

      expect(os.getStatus()).toBe(expected);
      expect(os.getUpdatedAt().getTime()).toBeGreaterThan(oldDate.getTime());
    });

    it.each([
      [ServiceOrderStatus.RECEIVED, (os: ServiceOrder) => os.awaitApproval()],
      [ServiceOrderStatus.RECEIVED, (os: ServiceOrder) => os.startProgress()],
      [ServiceOrderStatus.RECEIVED, (os: ServiceOrder) => os.complete()],
      [
        ServiceOrderStatus.IN_DIAGNOSIS,
        (os: ServiceOrder) => os.startDiagnosis(),
      ],
      [
        ServiceOrderStatus.IN_DIAGNOSIS,
        (os: ServiceOrder) => os.startProgress(),
      ],
      [
        ServiceOrderStatus.AWAITING_APPROVAL,
        (os: ServiceOrder) => os.startDiagnosis(),
      ],
      [
        ServiceOrderStatus.AWAITING_PARTS,
        (os: ServiceOrder) => os.awaitApproval(),
      ],
      [ServiceOrderStatus.IN_PROGRESS, (os: ServiceOrder) => os.awaitParts()],
      [ServiceOrderStatus.COMPLETED, (os: ServiceOrder) => os.startDiagnosis()],
      [ServiceOrderStatus.COMPLETED, (os: ServiceOrder) => os.cancel('motivo')],
      [ServiceOrderStatus.RECEIVED, (os: ServiceOrder) => os.deliver()],
      [ServiceOrderStatus.IN_PROGRESS, (os: ServiceOrder) => os.deliver()],
      [ServiceOrderStatus.DELIVERED, (os: ServiceOrder) => os.startDiagnosis()],
      [ServiceOrderStatus.DELIVERED, (os: ServiceOrder) => os.cancel('motivo')],
      [ServiceOrderStatus.CANCELLED, (os: ServiceOrder) => os.startDiagnosis()],
    ])('recusa transição inválida a partir de %s', (from, act) => {
      const os = restoredAt(from);

      expect(() => act(os)).toThrow(DomainException);
      expect(os.getStatus()).toBe(from);
    });

    it.each([
      ServiceOrderStatus.RECEIVED,
      ServiceOrderStatus.IN_DIAGNOSIS,
      ServiceOrderStatus.AWAITING_APPROVAL,
      ServiceOrderStatus.AWAITING_PARTS,
      ServiceOrderStatus.IN_PROGRESS,
    ])('cancel() cancela a partir de %s com motivo', (from) => {
      const os = restoredAt(from);

      os.cancel('Cliente desistiu');

      expect(os.getStatus()).toBe(ServiceOrderStatus.CANCELLED);
      expect(os.getCancellationReason()).toBe('Cliente desistiu');
    });

    it('cancel() recusa motivo vazio', () => {
      const os = restoredAt(ServiceOrderStatus.RECEIVED);

      expect(() => os.cancel('  ')).toThrow(
        'Motivo do cancelamento é obrigatório',
      );
      expect(os.getStatus()).toBe(ServiceOrderStatus.RECEIVED);
    });

    it('cancel() recusa a partir de estado terminal', () => {
      const os = restoredAt(ServiceOrderStatus.COMPLETED);

      expect(() => os.cancel('motivo')).toThrow(DomainException);
    });

    it('cancel() recusa a partir de DELIVERED', () => {
      const os = restoredAt(ServiceOrderStatus.DELIVERED);

      expect(() => os.cancel('motivo')).toThrow(DomainException);
    });
  });
});
