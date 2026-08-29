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
    const records: Record<string, Array<Record<string, unknown>>> = {};
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
    expect(records.serviceOrder.map((order) => order.status)).toEqual([
      'RECEIVED',
      'IN_DIAGNOSIS',
      'AWAITING_APPROVAL',
      'AWAITING_PARTS',
      'IN_PROGRESS',
      'COMPLETED',
      'DELIVERED',
      'CANCELLED',
    ]);
    expect(records.purchaseOrder).toHaveLength(1);
    expect(records.billing).toHaveLength(2);
    expect(records.notification).toBeUndefined();
  });
});
