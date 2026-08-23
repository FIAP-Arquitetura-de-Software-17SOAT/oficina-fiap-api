import { readFileSync } from 'fs';
import { join } from 'path';

describe('Prisma schema contracts', () => {
  const schema = readFileSync(join(__dirname, '../prisma/schema.prisma'), {
    encoding: 'utf8',
  });
  const billingMigration = readFileSync(
    join(
      __dirname,
      '../prisma/migrations/20260822010000_align_billing_gateway/migration.sql',
    ),
    { encoding: 'utf8' },
  );

  it('keeps Budget.serviceOrderId as an external string reference', () => {
    const budgetModel = schema.match(/model Budget \{[\s\S]*?\n\}/)?.[0];
    const serviceOrderModel = schema.match(
      /model ServiceOrder \{[\s\S]*?\n\}/,
    )?.[0];

    expect(budgetModel).toContain('serviceOrderId String');
    expect(budgetModel).not.toContain('serviceOrderId String       @db.Uuid');
    expect(budgetModel).not.toContain('serviceOrder ServiceOrder');
    expect(serviceOrderModel).not.toContain('budgets Budget[]');
  });

  it('persists gateway-backed billing without BillingPayment rows', () => {
    const billingModel = schema.match(/model Billing \{[\s\S]*?\n\}/)?.[0];

    expect(billingModel).toContain(
      'budgetId             String        @db.Uuid',
    );
    expect(billingModel).toContain('amountCents          Int');
    expect(billingModel).toContain('paymentLink          String?');
    expect(billingModel).toContain(
      'gatewayTransactionId String?       @unique',
    );
    expect(billingModel).toContain('paymentMethod        PaymentMethod?');
    expect(billingModel).toContain(
      'generatedAt          DateTime      @default(now())',
    );
    expect(billingModel).toContain('paidAt               DateTime?');
    expect(billingModel).toContain('expiresAt            DateTime?');
    expect(billingModel).not.toContain('payments     BillingPayment[]');
    expect(schema).not.toContain('model BillingPayment');
  });

  it('backfills legacy billings before enforcing gateway billing requirements', () => {
    expect(billingMigration).toContain('ADD COLUMN "budgetId" UUID,');
    expect(billingMigration).toContain('ADD COLUMN "amountCents" INTEGER,');
    expect(billingMigration).toContain('AND "budget"."status" = \'ACCEPTED\'');
    expect(billingMigration).toContain('SET "budgetId" = (');
    expect(billingMigration).toContain(
      'SET "amountCents" = "billing"."totalCents"',
    );
    expect(billingMigration).toContain('Cannot align billing gateway');
    expect(billingMigration).toContain('ALTER COLUMN "budgetId" SET NOT NULL');
    expect(billingMigration).toContain(
      'ALTER COLUMN "amountCents" SET NOT NULL',
    );
  });

  it('normalizes the legacy budget reference to text before the billing backfill', () => {
    const dropBudgetForeignKey = billingMigration.indexOf(
      'DROP CONSTRAINT IF EXISTS "budget_serviceOrderId_fkey"',
    );
    const alterBudgetReference = billingMigration.indexOf(
      'ALTER COLUMN "serviceOrderId" TYPE TEXT',
    );
    const budgetBackfill = billingMigration.indexOf('SET "budgetId" = (');

    expect(dropBudgetForeignKey).toBeGreaterThan(-1);
    expect(alterBudgetReference).toBeGreaterThan(dropBudgetForeignKey);
    expect(billingMigration).toContain('USING "serviceOrderId"::text');
    expect(budgetBackfill).toBeGreaterThan(alterBudgetReference);
    expect(billingMigration).toContain(
      '"budget"."serviceOrderId" = "billing"."serviceOrderId"::text',
    );
  });

  it('aborts legacy partial payments before destructive migration steps', () => {
    const partialPaymentGuard = billingMigration.indexOf(
      `"status"::text = 'PARTIALLY_PAID'`,
    );
    const paidBalanceGuard = billingMigration.indexOf(
      `"paidCents" > 0 AND "status"::text <> 'PAID'`,
    );
    const abortMessage = billingMigration.indexOf(
      'Cannot align billing gateway: partial legacy payments require manual reconciliation',
    );
    const dropPaymentTable = billingMigration.indexOf(
      'DROP TABLE "billing_payment"',
    );

    expect(partialPaymentGuard).toBeGreaterThan(-1);
    expect(paidBalanceGuard).toBeGreaterThan(partialPaymentGuard);
    expect(abortMessage).toBeGreaterThan(paidBalanceGuard);
    expect(dropPaymentTable).toBeGreaterThan(abortMessage);
  });

  it('stages latest paid payment metadata before dropping the legacy ledger', () => {
    const paidMetadataBackfill = billingMigration.indexOf(
      'SET "paymentMethod" =',
    );
    const dropPaymentTable = billingMigration.indexOf(
      'DROP TABLE "billing_payment"',
    );

    expect(billingMigration).toContain('DISTINCT ON ("billingId")');
    expect(billingMigration).toContain(`WHEN 'CREDIT_CARD' THEN 'CARD'`);
    expect(billingMigration).toContain(`WHEN 'DEBIT_CARD' THEN 'CARD'`);
    expect(billingMigration).toContain(`WHEN 'BANK_TRANSFER' THEN 'CARD'`);
    expect(billingMigration).toContain(`WHEN 'PIX' THEN 'PIX'`);
    expect(billingMigration).toContain(`WHEN 'CASH' THEN 'CASH'`);
    expect(billingMigration).toContain('"paidAt" = latest_payment."paidAt"');
    expect(paidMetadataBackfill).toBeGreaterThan(-1);
    expect(dropPaymentTable).toBeGreaterThan(paidMetadataBackfill);
  });

  it('wraps the complete migration in an explicit transaction', () => {
    const normalizedMigration = billingMigration.trim();

    expect(normalizedMigration.startsWith('BEGIN;')).toBe(true);
    expect(normalizedMigration.endsWith('COMMIT;')).toBe(true);
  });
});
