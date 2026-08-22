import { readFileSync } from 'fs';
import { join } from 'path';

describe('Prisma schema contracts', () => {
  const schema = readFileSync(join(__dirname, '../prisma/schema.prisma'), {
    encoding: 'utf8',
  });

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

    expect(billingModel).toContain('budgetId             String        @db.Uuid');
    expect(billingModel).toContain('amountCents          Int');
    expect(billingModel).toContain('paymentLink          String?');
    expect(billingModel).toContain('gatewayTransactionId String?       @unique');
    expect(billingModel).toContain('paymentMethod        PaymentMethod?');
    expect(billingModel).toContain('generatedAt          DateTime      @default(now())');
    expect(billingModel).toContain('paidAt               DateTime?');
    expect(billingModel).toContain('expiresAt            DateTime?');
    expect(billingModel).not.toContain('payments     BillingPayment[]');
    expect(schema).not.toContain('model BillingPayment');
  });
});
