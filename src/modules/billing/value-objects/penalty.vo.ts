import { Money } from '../../../shared/domain/value-objects/money.vo';

const FIXED_PENALTY_RATE = 0.02;
const MONTHLY_INTEREST_RATE = 0.01;
const COMMERCIAL_MONTH_DAYS = 30;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

type PenaltyProps = {
  originalAmount: Money;
  expiresAt: Date | null;
  calculatedAt?: Date;
};

export class Penalty {
  private constructor(
    private readonly originalAmount: Money,
    private readonly fixedPenaltyAmount: Money,
    private readonly interestAmount: Money,
    private readonly overdueDays: number,
    private readonly calculatedAt: Date,
  ) {}

  static calculate(props: PenaltyProps): Penalty {
    const calculatedAt = props.calculatedAt ?? new Date();
    const overdueDays = calculateOverdueDays(props.expiresAt, calculatedAt);

    if (overdueDays === 0) {
      return new Penalty(
        props.originalAmount,
        Money.fromCents(0),
        Money.fromCents(0),
        overdueDays,
        calculatedAt,
      );
    }

    const originalCents = props.originalAmount.valueInCents;
    const fixedPenaltyCents = Math.round(originalCents * FIXED_PENALTY_RATE);
    const interestCents = Math.round(
      originalCents *
        MONTHLY_INTEREST_RATE *
        (overdueDays / COMMERCIAL_MONTH_DAYS),
    );

    return new Penalty(
      props.originalAmount,
      Money.fromCents(fixedPenaltyCents),
      Money.fromCents(interestCents),
      overdueDays,
      calculatedAt,
    );
  }

  getOriginalAmount(): Money {
    return this.originalAmount;
  }

  getFixedPenaltyAmount(): Money {
    return this.fixedPenaltyAmount;
  }

  getInterestAmount(): Money {
    return this.interestAmount;
  }

  getOverdueDays(): number {
    return this.overdueDays;
  }

  getTotalAmount(): Money {
    return this.originalAmount
      .add(this.fixedPenaltyAmount)
      .add(this.interestAmount);
  }

  getCalculatedAt(): Date {
    return this.calculatedAt;
  }

  hasOverdueAmount(): boolean {
    return this.overdueDays > 0;
  }
}

function calculateOverdueDays(
  expiresAt: Date | null,
  calculatedAt: Date,
): number {
  if (!expiresAt || calculatedAt.getTime() <= expiresAt.getTime()) return 0;

  return Math.ceil((calculatedAt.getTime() - expiresAt.getTime()) / DAY_IN_MS);
}
