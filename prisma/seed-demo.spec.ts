import { runDemoSeed } from './seed-demo';

describe('runDemoSeed', () => {
  it('rejects execution in production before writing demo data', async () => {
    const prisma = {} as Parameters<typeof runDemoSeed>[0];

    await expect(
      runDemoSeed(prisma, { NODE_ENV: 'production' }),
    ).rejects.toThrow(
      'Dados demonstrativos não podem ser inseridos em produção',
    );
  });

  it('creates an idempotent overview of the workshop workflow', async () => {
    const records: Record<string, Array<Record<string, unknown>>> = {
      serviceOrder: [
        {
          id: '60000000-0000-4000-8000-000000000003',
          status: 'AWAITING_APPROVAL',
          mechanicId: '70000000-0000-4000-8000-000000000001',
        },
      ],
    };
    const prisma = Object.fromEntries(
      [
        'client',
        'vehicle',
        'service',
        'part',
        'stockMovement',
        'serviceOrder',
        'budget',
        'purchaseOrder',
        'billing',
      ].map((model) => [
        model,
        {
          findUnique: jest.fn(async ({ where }) =>
            records[model]?.find((record) =>
              Object.entries(where).every(
                ([key, value]) => record[key] === value,
              ),
            ),
          ),
          create: jest.fn(async ({ data }) => {
            const record = { ...data } as Record<string, unknown>;
            records[model] ??= [];
            records[model].push(record);
            return record;
          }),
        },
      ]),
    ) as unknown as Parameters<typeof runDemoSeed>[0];

    await runDemoSeed(prisma, { NODE_ENV: 'development' });
    await runDemoSeed(prisma, { NODE_ENV: 'development' });

    expect(records.client).toHaveLength(8);
    expect(records.serviceOrder).toHaveLength(8);
    expect(records.serviceOrder.map((order) => order.status)).toEqual(
      expect.arrayContaining([
        'RECEIVED',
        'IN_DIAGNOSIS',
        'AWAITING_APPROVAL',
        'AWAITING_PARTS',
        'IN_PROGRESS',
        'COMPLETED',
        'DELIVERED',
        'CANCELLED',
      ]),
    );
    expect(
      new Set(
        records.serviceOrder
          .filter((order) =>
            [
              'IN_DIAGNOSIS',
              'AWAITING_APPROVAL',
              'AWAITING_PARTS',
              'IN_PROGRESS',
            ].includes(order.status as string),
          )
          .map((order) => order.mechanicId),
      ).size,
    ).toBe(4);
    expect(
      records.budget
        .filter(
          (budget) =>
            budget.serviceOrderId === '60000000-0000-4000-8000-000000000003',
        )
        .map((budget) => ({ version: budget.version, status: budget.status })),
    ).toEqual(
      expect.arrayContaining([
        { version: 1, status: 'REFUSED' },
        { version: 2, status: 'WAITING_APPROVAL' },
      ]),
    );
    expect(
      records.serviceOrder.find(
        (order) => order.id === '60000000-0000-4000-8000-000000000008',
      )?.cancellationReason,
    ).toBe('Cliente desistiu do reparo');
    expect(records.purchaseOrder).toHaveLength(1);
    expect(records.billing).toHaveLength(2);
    expect(records.notification).toBeUndefined();
  });
});
