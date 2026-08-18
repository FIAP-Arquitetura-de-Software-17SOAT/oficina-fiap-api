import { DomainException } from '../../../shared/domain/domain.exception';
import { PartCode } from './part-code';

describe('PartCode', () => {
  it('normalizes a SKU by trimming and uppercasing it', () => {
    const code = PartCode.create('  oil-filter-123  ');

    expect(code.getValue()).toBe('OIL-FILTER-123');
    expect(String(code)).toBe('OIL-FILTER-123');
  });

  it.each(['', '   ', null as unknown as string])(
    'rejects an empty SKU',
    (input) => {
      expect(() => PartCode.create(input)).toThrow(DomainException);
    },
  );

  it('compares normalized values', () => {
    expect(PartCode.create('oil-filter').equals(PartCode.create('OIL-FILTER'))).toBe(
      true,
    );
  });
});
