import { Document } from '../src/modules/client/value-objects/document.vo';

type SeedEnvironment = Record<string, string | undefined>;

type SeedRecord = { id: string } & Record<string, unknown>;

type SeedDelegate = {
  findUnique: (args: {
    where: Record<string, unknown>;
  }) => Promise<SeedRecord | null>;
  create: (args: { data: Record<string, unknown> }) => Promise<SeedRecord>;
};

type DemoSeedPrisma = {
  client: SeedDelegate;
  vehicle: SeedDelegate;
  service: SeedDelegate;
  part: SeedDelegate;
  stockMovement: SeedDelegate;
  serviceOrder: SeedDelegate;
  budget: SeedDelegate;
  purchaseOrder: SeedDelegate;
  billing: SeedDelegate;
};

const ids = {
  clients: [
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000006',
    '10000000-0000-4000-8000-000000000007',
    '10000000-0000-4000-8000-000000000008',
  ],
  services: {
    inspection: '20000000-0000-4000-8000-000000000001',
    oilChange: '20000000-0000-4000-8000-000000000002',
    brakeRepair: '20000000-0000-4000-8000-000000000003',
  },
  parts: {
    filter: '30000000-0000-4000-8000-000000000001',
    brakePad: '30000000-0000-4000-8000-000000000002',
    oil: '30000000-0000-4000-8000-000000000003',
  },
};

/**
 * O seed grava direto pelo Prisma, sem passar pela entidade — então nada aqui
 * confere CPF. Um dígito verificador errado entra calado na escrita e só
 * explode na LEITURA: `Client.restore` revalida o documento, e uma única linha
 * ruim derruba `GET /clients` inteiro com 400, sem forma de corrigir pela
 * própria API. Foi o que aconteceu com o CPF do sétimo cliente.
 *
 * Passar pelo Value Object aqui reusa a regra do domínio (sem duplicar o
 * cálculo dos dígitos) e transforma o problema num erro barulhento no seed,
 * onde custa dez segundos para consertar.
 */
function validDocument(document: string): string {
  try {
    return Document.create(document).getValue();
  } catch {
    throw new Error(
      `Seed: CPF/CNPJ inválido (${document}). Confira os dígitos verificadores.`,
    );
  }
}

async function createIfMissing(
  delegate: SeedDelegate,
  where: Record<string, unknown>,
  data: Record<string, unknown>,
): Promise<SeedRecord> {
  const existing = await delegate.findUnique({ where });
  return existing ?? delegate.create({ data });
}

export async function runDemoSeed(
  prisma: DemoSeedPrisma,
  env: SeedEnvironment,
): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw new Error('Dados demonstrativos não podem ser inseridos em produção');
  }

  const clients = await Promise.all(
    [
      ['Ana Costa', '52998224725', 'ana.costa@example.test', '(11) 98888-1001'],
      [
        'Bruno Lima',
        '11144477735',
        'bruno.lima@example.test',
        '(11) 98888-1002',
      ],
      [
        'Carla Souza',
        '12345678909',
        'carla.souza@example.test',
        '(11) 98888-1003',
      ],
      [
        'Diego Alves',
        '93541134780',
        'diego.alves@example.test',
        '(11) 98888-1004',
      ],
      [
        'Elisa Rocha',
        '71428793860',
        'elisa.rocha@example.test',
        '(11) 98888-1005',
      ],
      [
        'Fabio Nunes',
        '39053344705',
        'fabio.nunes@example.test',
        '(11) 98888-1006',
      ],
      [
        'Gabi Freitas',
        '07098765481',
        'gabi.freitas@example.test',
        '(11) 98888-1007',
      ],
      [
        'Henrique Melo',
        '98765432100',
        'henrique.melo@example.test',
        '(11) 98888-1008',
      ],
    ].map(([name, rawDocument, email, phone], index) => {
      const document = validDocument(rawDocument);

      return createIfMissing(
        prisma.client,
        { document },
        {
          id: ids.clients[index],
          name,
          document,
          email,
          phone,
        },
      );
    }),
  );

  const vehicles = await Promise.all(
    [
      ['ABC1D01', 'Fiat', 'Argo', 2022],
      ['ABC1D02', 'Volkswagen', 'Polo', 2021],
      ['ABC1D03', 'Chevrolet', 'Onix', 2023],
      ['ABC1D04', 'Toyota', 'Corolla', 2020],
      ['ABC1D05', 'Honda', 'Civic', 2019],
      ['ABC1D06', 'Hyundai', 'HB20', 2022],
      ['ABC1D07', 'Renault', 'Kwid', 2024],
      ['ABC1D08', 'Nissan', 'Versa', 2021],
    ].map(([plate, brand, model, year], index) =>
      createIfMissing(
        prisma.vehicle,
        { plate },
        {
          id: `40000000-0000-4000-8000-00000000000${index + 1}`,
          clientId: clients[index].id,
          plate,
          brand,
          model,
          year,
        },
      ),
    ),
  );

  const [inspection, oilChange, brakeRepair] = await Promise.all([
    createIfMissing(
      prisma.service,
      { name: 'Inspeção geral' },
      {
        id: ids.services.inspection,
        name: 'Inspeção geral',
        description: 'Avaliação inicial do veículo',
        priceCents: 12000,
      },
    ),
    createIfMissing(
      prisma.service,
      { name: 'Troca de óleo' },
      {
        id: ids.services.oilChange,
        name: 'Troca de óleo',
        description: 'Troca de óleo e filtro',
        priceCents: 18000,
      },
    ),
    createIfMissing(
      prisma.service,
      { name: 'Reparo de freios' },
      {
        id: ids.services.brakeRepair,
        name: 'Reparo de freios',
        description: 'Substituição de componentes do sistema de freios',
        priceCents: 35000,
      },
    ),
  ]);

  const [filter, brakePad, oil] = await Promise.all([
    createIfMissing(
      prisma.part,
      { code: 'FLT-OLEO-001' },
      {
        id: ids.parts.filter,
        code: 'FLT-OLEO-001',
        name: 'Filtro de óleo',
        type: 'PART',
        unit: 'UNIT',
        unitPriceCents: 4500,
        quantity: 10,
        minimumQuantity: 3,
      },
    ),
    createIfMissing(
      prisma.part,
      { code: 'PST-FREIO-001' },
      {
        id: ids.parts.brakePad,
        code: 'PST-FREIO-001',
        name: 'Jogo de pastilhas de freio',
        type: 'PART',
        unit: 'UNIT',
        unitPriceCents: 22000,
        quantity: 1,
        minimumQuantity: 4,
      },
    ),
    createIfMissing(
      prisma.part,
      { code: 'OLEO-5W30-001' },
      {
        id: ids.parts.oil,
        code: 'OLEO-5W30-001',
        name: 'Óleo 5W30',
        type: 'SUPPLY',
        unit: 'LITER',
        unitPriceCents: 3800,
        quantity: 20,
        minimumQuantity: 5,
      },
    ),
  ]);

  await Promise.all([
    createIfMissing(
      prisma.stockMovement,
      { idempotencyKey: 'demo-in-filter' },
      {
        id: '50000000-0000-4000-8000-000000000001',
        idempotencyKey: 'demo-in-filter',
        type: 'IN',
        quantity: 10,
        partId: filter.id,
      },
    ),
    createIfMissing(
      prisma.stockMovement,
      { idempotencyKey: 'demo-in-brake-pad' },
      {
        id: '50000000-0000-4000-8000-000000000002',
        idempotencyKey: 'demo-in-brake-pad',
        type: 'IN',
        quantity: 1,
        partId: brakePad.id,
      },
    ),
    createIfMissing(
      prisma.stockMovement,
      { idempotencyKey: 'demo-in-oil' },
      {
        id: '50000000-0000-4000-8000-000000000003',
        idempotencyKey: 'demo-in-oil',
        type: 'IN',
        quantity: 20,
        partId: oil.id,
      },
    ),
  ]);

  const serviceOrders = await Promise.all(
    [
      ['RECEIVED', 'Veículo recebido para avaliação'],
      ['IN_DIAGNOSIS', 'Investigação de ruído no motor'],
      ['AWAITING_APPROVAL', 'Troca de óleo e revisão preventiva'],
      ['AWAITING_PARTS', 'Substituição de pastilhas de freio'],
      ['IN_PROGRESS', 'Troca de óleo em execução'],
      ['COMPLETED', 'Revisão concluída, aguardando cobrança'],
      ['DELIVERED', 'Serviço concluído e veículo entregue'],
      ['CANCELLED', 'Cliente desistiu do reparo'],
    ].map(([status, description], index) =>
      createIfMissing(
        prisma.serviceOrder,
        { id: `60000000-0000-4000-8000-00000000000${index + 1}` },
        {
          id: `60000000-0000-4000-8000-00000000000${index + 1}`,
          clientId: clients[index].id,
          vehicleId: vehicles[index].id,
          description,
          status,
          ...(index >= 1 && {
            mechanicId: `71000000-0000-4000-8000-00000000000${index}`,
            assignedAt: new Date('2026-01-10T09:00:00.000Z'),
          }),
          ...(index === 4 && {
            partsDispatchedAt: new Date('2026-01-11T10:00:00.000Z'),
          }),
          ...(index >= 5 && {
            completedAt: new Date('2026-01-12T15:00:00.000Z'),
          }),
          ...(index === 7 && {
            cancellationReason: 'Cliente desistiu do reparo',
          }),
        },
      ),
    ),
  );

  const budgets = await Promise.all([
    createIfMissing(
      prisma.budget,
      { id: '80000000-0000-4000-8000-000000000001' },
      {
        id: '80000000-0000-4000-8000-000000000001',
        serviceOrderId: serviceOrders[2].id,
        version: 1,
        status: 'REFUSED',
        totalCents: 22500,
        refusalReason: 'Cliente achou o valor acima do esperado',
        sentAt: new Date('2026-01-10T10:00:00.000Z'),
        answeredAt: new Date('2026-01-10T14:00:00.000Z'),
        items: {
          create: [
            {
              id: '81000000-0000-4000-8000-000000000001',
              serviceId: inspection.id,
              description: 'Inspeção geral',
              type: 'SERVICE',
              quantity: 1,
              unitPriceCents: 12000,
              subtotalCents: 12000,
            },
            {
              id: '81000000-0000-4000-8000-000000000002',
              partId: filter.id,
              description: 'Filtro de óleo',
              type: 'PART',
              quantity: 1,
              unitPriceCents: 4500,
              subtotalCents: 4500,
            },
            {
              id: '81000000-0000-4000-8000-000000000003',
              partId: oil.id,
              description: 'Óleo 5W30',
              type: 'PART',
              quantity: 1.5,
              unitPriceCents: 4000,
              subtotalCents: 6000,
            },
          ],
        },
      },
    ),
    createIfMissing(
      prisma.budget,
      { id: '80000000-0000-4000-8000-000000000002' },
      {
        id: '80000000-0000-4000-8000-000000000002',
        serviceOrderId: serviceOrders[3].id,
        version: 1,
        status: 'ACCEPTED',
        totalCents: 57000,
        sentAt: new Date('2026-01-09T10:00:00.000Z'),
        answeredAt: new Date('2026-01-09T14:00:00.000Z'),
        items: {
          create: [
            {
              id: '81000000-0000-4000-8000-000000000004',
              serviceId: brakeRepair.id,
              description: 'Reparo de freios',
              type: 'SERVICE',
              quantity: 1,
              unitPriceCents: 35000,
              subtotalCents: 35000,
            },
            {
              id: '81000000-0000-4000-8000-000000000005',
              partId: brakePad.id,
              description: 'Jogo de pastilhas de freio',
              type: 'PART',
              quantity: 1,
              unitPriceCents: 22000,
              subtotalCents: 22000,
            },
          ],
        },
      },
    ),
    createIfMissing(
      prisma.budget,
      { id: '80000000-0000-4000-8000-000000000003' },
      {
        id: '80000000-0000-4000-8000-000000000003',
        serviceOrderId: serviceOrders[4].id,
        version: 1,
        status: 'ACCEPTED',
        totalCents: 22500,
        sentAt: new Date('2026-01-10T10:00:00.000Z'),
        answeredAt: new Date('2026-01-10T12:00:00.000Z'),
        items: {
          create: [
            {
              id: '81000000-0000-4000-8000-000000000006',
              serviceId: oilChange.id,
              description: 'Troca de óleo',
              type: 'SERVICE',
              quantity: 1,
              unitPriceCents: 18000,
              subtotalCents: 18000,
            },
            {
              id: '81000000-0000-4000-8000-000000000007',
              partId: filter.id,
              description: 'Filtro de óleo',
              type: 'PART',
              quantity: 1,
              unitPriceCents: 4500,
              subtotalCents: 4500,
            },
          ],
        },
      },
    ),
    createIfMissing(
      prisma.budget,
      { id: '80000000-0000-4000-8000-000000000004' },
      {
        id: '80000000-0000-4000-8000-000000000004',
        serviceOrderId: serviceOrders[5].id,
        version: 1,
        status: 'ACCEPTED',
        totalCents: 12000,
        sentAt: new Date('2026-01-10T10:00:00.000Z'),
        answeredAt: new Date('2026-01-10T12:00:00.000Z'),
        items: {
          create: [
            {
              id: '81000000-0000-4000-8000-000000000008',
              serviceId: inspection.id,
              description: 'Inspeção geral',
              type: 'SERVICE',
              quantity: 1,
              unitPriceCents: 12000,
              subtotalCents: 12000,
            },
          ],
        },
      },
    ),
    createIfMissing(
      prisma.budget,
      { id: '80000000-0000-4000-8000-000000000005' },
      {
        id: '80000000-0000-4000-8000-000000000005',
        serviceOrderId: serviceOrders[6].id,
        version: 1,
        status: 'ACCEPTED',
        totalCents: 18000,
        sentAt: new Date('2026-01-08T10:00:00.000Z'),
        answeredAt: new Date('2026-01-08T12:00:00.000Z'),
        items: {
          create: [
            {
              id: '81000000-0000-4000-8000-000000000009',
              serviceId: oilChange.id,
              description: 'Troca de óleo',
              type: 'SERVICE',
              quantity: 1,
              unitPriceCents: 18000,
              subtotalCents: 18000,
            },
          ],
        },
      },
    ),
    createIfMissing(
      prisma.budget,
      { id: '80000000-0000-4000-8000-000000000007' },
      {
        id: '80000000-0000-4000-8000-000000000007',
        serviceOrderId: serviceOrders[2].id,
        version: 2,
        status: 'WAITING_APPROVAL',
        totalCents: 18000,
        sentAt: new Date('2026-01-11T10:00:00.000Z'),
        items: {
          create: [
            {
              id: '81000000-0000-4000-8000-000000000011',
              serviceId: oilChange.id,
              description: 'Troca de óleo com valor revisado',
              type: 'SERVICE',
              quantity: 1,
              unitPriceCents: 18000,
              subtotalCents: 18000,
            },
          ],
        },
      },
    ),
  ]);

  await createIfMissing(
    prisma.purchaseOrder,
    { number: 'PC-2026-0001' },
    {
      id: '90000000-0000-4000-8000-000000000001',
      number: 'PC-2026-0001',
      supplier: 'Auto Peças Central',
      status: 'AWAITING_DELIVERY',
      items: {
        create: [
          {
            id: '91000000-0000-4000-8000-000000000001',
            partId: brakePad.id,
            quantity: 3,
            unitPriceCents: 22000,
          },
        ],
      },
    },
  );

  await Promise.all([
    createIfMissing(
      prisma.billing,
      { serviceOrderId: serviceOrders[5].id },
      {
        id: 'a0000000-0000-4000-8000-000000000001',
        serviceOrderId: serviceOrders[5].id,
        budgetId: budgets[3].id,
        status: 'PENDING',
        amountCents: 12000,
      },
    ),
    createIfMissing(
      prisma.billing,
      { serviceOrderId: serviceOrders[6].id },
      {
        id: 'a0000000-0000-4000-8000-000000000002',
        serviceOrderId: serviceOrders[6].id,
        budgetId: budgets[4].id,
        status: 'PAID',
        amountCents: 18000,
        gatewayTransactionId: 'demo-payment-0001',
        paymentMethod: 'PIX',
        paidAt: new Date('2026-01-12T16:00:00.000Z'),
      },
    ),
  ]);
}

export async function runDemoSeedScript(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];

  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL deve ser configurada para inserir dados demonstrativos',
    );
  }

  const { PrismaPg } = await import('@prisma/adapter-pg');
  const clientModule =
    process.env['PRISMA_CLIENT_MODULE'] ?? '../generated/prisma/client.js';
  const { PrismaClient } = require(
    clientModule,
  ) as typeof import('../generated/prisma/client.js');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    await runDemoSeed(prisma as unknown as DemoSeedPrisma, process.env);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runDemoSeedScript().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
