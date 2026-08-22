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

    it('não tem data de finalização ao criar', () => {
      const os = ServiceOrder.create(validProps());

      expect(os.getCompletedAt()).toBeNull();
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

    it('preserva completedAt vindo do banco', () => {
      const completedAt = new Date('2026-03-01T10:00:00.000Z');

      const os = ServiceOrder.restore(
        'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        validProps({ status: ServiceOrderStatus.COMPLETED, completedAt }),
      );

      expect(os.getCompletedAt()).toBe(completedAt);
    });
  });

  describe('transições de status', () => {
    const oldDate = new Date('2020-01-01T00:00:00.000Z');

    const MECHANIC = 'cccccccc-1c2e-4f5a-8b9c-0d1e2f3a4b5c';

    // Da atribuição em diante a OS sempre tem mecânico; sem ele ela não sai de
    // RECEIVED, então os cenários de transição partem já atribuídos.
    const restoredAt = (status: ServiceOrderStatus) =>
      ServiceOrder.restore(
        'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        validProps({
          status,
          mechanicId: status === ServiceOrderStatus.RECEIVED ? null : MECHANIC,
          createdAt: oldDate,
          updatedAt: oldDate,
        }),
      );

    it.each([
      [
        ServiceOrderStatus.RECEIVED,
        (os: ServiceOrder) => os.assignToMechanic(MECHANIC),
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
        (os: ServiceOrder) => os.registerPartsDispatched(),
        ServiceOrderStatus.IN_PROGRESS,
      ],
      [
        ServiceOrderStatus.AWAITING_PARTS,
        (os: ServiceOrder) => os.registerPartsDispatched(),
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

    it('complete() define completedAt', () => {
      const os = restoredAt(ServiceOrderStatus.IN_PROGRESS);

      os.complete();

      expect(os.getCompletedAt()).toBeInstanceOf(Date);
    });

    it.each([
      [ServiceOrderStatus.RECEIVED, (os: ServiceOrder) => os.awaitApproval()],
      [
        ServiceOrderStatus.RECEIVED,
        (os: ServiceOrder) => os.registerPartsDispatched(),
      ],
      [ServiceOrderStatus.RECEIVED, (os: ServiceOrder) => os.complete()],
      [
        ServiceOrderStatus.IN_DIAGNOSIS,
        (os: ServiceOrder) => os.assignToMechanic(MECHANIC),
      ],
      [
        ServiceOrderStatus.IN_DIAGNOSIS,
        (os: ServiceOrder) => os.registerPartsDispatched(),
      ],
      [
        ServiceOrderStatus.AWAITING_APPROVAL,
        (os: ServiceOrder) => os.assignToMechanic(MECHANIC),
      ],
      [
        ServiceOrderStatus.AWAITING_PARTS,
        (os: ServiceOrder) => os.awaitApproval(),
      ],
      [ServiceOrderStatus.IN_PROGRESS, (os: ServiceOrder) => os.awaitParts()],
      [
        ServiceOrderStatus.COMPLETED,
        (os: ServiceOrder) => os.assignToMechanic(MECHANIC),
      ],
      [ServiceOrderStatus.COMPLETED, (os: ServiceOrder) => os.cancel('motivo')],
      [ServiceOrderStatus.RECEIVED, (os: ServiceOrder) => os.deliver()],
      [ServiceOrderStatus.IN_PROGRESS, (os: ServiceOrder) => os.deliver()],
      [
        ServiceOrderStatus.DELIVERED,
        (os: ServiceOrder) => os.assignToMechanic(MECHANIC),
      ],
      [ServiceOrderStatus.DELIVERED, (os: ServiceOrder) => os.cancel('motivo')],
      [
        ServiceOrderStatus.CANCELLED,
        (os: ServiceOrder) => os.assignToMechanic(MECHANIC),
      ],
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
  describe('atribuição ao mecânico', () => {
    const MECHANIC = 'cccccccc-1c2e-4f5a-8b9c-0d1e2f3a4b5c';

    it('move para IN_DIAGNOSIS e inicializa o timer', () => {
      const os = ServiceOrder.create(validProps());

      expect(os.getAssignedAt()).toBeNull();

      os.assignToMechanic(MECHANIC);

      expect(os.getStatus()).toBe(ServiceOrderStatus.IN_DIAGNOSIS);
      expect(os.getMechanicId()).toBe(MECHANIC);
      expect(os.getAssignedAt()).toBeInstanceOf(Date);
    });

    it('normaliza o id do mecânico e recusa vazio', () => {
      const os = ServiceOrder.create(validProps());
      os.assignToMechanic(`  ${MECHANIC}  `);

      expect(os.getMechanicId()).toBe(MECHANIC);

      const outra = ServiceOrder.create(validProps());
      expect(() => outra.assignToMechanic('   ')).toThrow(
        'Mecânico da ordem de serviço é obrigatório',
      );
    });

    it('recusa reatribuir uma OS que já tem mecânico', () => {
      const os = ServiceOrder.restore('id', {
        ...validProps(),
        status: ServiceOrderStatus.RECEIVED,
        mechanicId: MECHANIC,
      });

      expect(() => os.assignToMechanic(MECHANIC)).toThrow(
        'Ordem de serviço já atribuída a um mecânico',
      );
    });

    it('só atribui a partir de RECEBIDA', () => {
      const os = ServiceOrder.restore('id', {
        ...validProps(),
        status: ServiceOrderStatus.IN_PROGRESS,
      });

      expect(() => os.assignToMechanic(MECHANIC)).toThrow(DomainException);
    });

    it('tempo de execução conta da atribuição até a finalização', () => {
      const assignedAt = new Date('2026-01-01T00:00:00.000Z');
      const os = ServiceOrder.restore('id', {
        ...validProps(),
        status: ServiceOrderStatus.COMPLETED,
        createdAt: new Date('2025-12-01T00:00:00.000Z'),
        assignedAt,
        completedAt: new Date('2026-01-01T02:00:00.000Z'),
      });

      // Se contasse de createdAt daria um mês, não duas horas.
      expect(os.getExecutionTimeMs()).toBe(2 * 60 * 60 * 1000);
    });

    it('tempo de execução é nulo sem uma das pontas', () => {
      const semTimer = ServiceOrder.restore('id', {
        ...validProps(),
        status: ServiceOrderStatus.COMPLETED,
        completedAt: new Date(),
      });

      expect(semTimer.getExecutionTimeMs()).toBeNull();

      const semFim = ServiceOrder.create(validProps());
      semFim.assignToMechanic(MECHANIC);

      expect(semFim.getExecutionTimeMs()).toBeNull();
    });
  });
  describe('o furo do atalho', () => {
    const MECHANIC = 'cccccccc-1c2e-4f5a-8b9c-0d1e2f3a4b5c';

    it('OS sem mecânico não entra em execução, mesmo com o status permitindo', () => {
      // AWAITING_PARTS -> IN_PROGRESS está na tabela de transições, mas a
      // tabela não pergunta se alguém pegou o serviço.
      const semDono = ServiceOrder.restore('id', {
        ...validProps(),
        status: ServiceOrderStatus.AWAITING_PARTS,
        mechanicId: null,
      });

      expect(() => semDono.registerPartsDispatched()).toThrow(
        'Ordem de serviço sem mecânico responsável não entra em execução',
      );
      expect(semDono.getStatus()).toBe(ServiceOrderStatus.AWAITING_PARTS);
    });

    it('entrar em execução deixa registrado que o estoque atendeu', () => {
      const os = ServiceOrder.restore('id', {
        ...validProps(),
        status: ServiceOrderStatus.AWAITING_PARTS,
        mechanicId: MECHANIC,
      });

      expect(os.getPartsDispatchedAt()).toBeNull();

      os.registerPartsDispatched();

      expect(os.getStatus()).toBe(ServiceOrderStatus.IN_PROGRESS);
      expect(os.getPartsDispatchedAt()).toBeInstanceOf(Date);
    });

    it('uma OS em execução sempre tem mecânico e atendimento de estoque', () => {
      const os = ServiceOrder.create(validProps());
      os.assignToMechanic(MECHANIC);
      os.awaitApproval();
      os.awaitParts();
      os.registerPartsDispatched();
      os.complete();

      // As três coisas que o carro B não tinha.
      expect(os.getMechanicId()).toBe(MECHANIC);
      expect(os.getAssignedAt()).toBeInstanceOf(Date);
      expect(os.getPartsDispatchedAt()).toBeInstanceOf(Date);
      expect(os.getExecutionTimeMs()).not.toBeNull();
    });
  });
});
