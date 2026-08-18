import { DomainException } from '../../../shared/domain/domain.exception';
import { MeasurementUnit, Part, PartProps, PartType } from './part.entity';

const validProps = (overrides: Partial<PartProps> = {}): PartProps => ({
  code: 'oil-filter-123',
  name: 'Oil filter',
  description: 'Filter for engine oil',
  type: PartType.PART,
  unit: MeasurementUnit.UNIT,
  unitPrice: '149.90',
  quantity: 10,
  minimumQuantity: 3,
  ...overrides,
});

describe('Part', () => {
  it('creates a part with normalized value objects', () => {
    const part = Part.create(validProps({ code: '  oil-filter-123  ' }));

    expect(part.getId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(part.getCode().getValue()).toBe('OIL-FILTER-123');
    expect(part.getUnitPrice().getValue()).toBe('149.90');
    expect(part.getQuantity().getValue()).toBe(10);
    expect(part.getMinimumQuantity().getValue()).toBe(3);
  });

  it('reports whether the requested quantity is available', () => {
    const part = Part.create(validProps({ quantity: 10 }));

    expect(part.hasAvailability(10)).toBe(true);
    expect(part.hasAvailability(11)).toBe(false);
  });

  it('decreases stock and updates the modification timestamp', () => {
    const oldDate = new Date('2026-01-01T10:00:00.000Z');
    const part = Part.restore(
      'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      validProps({ createdAt: oldDate, updatedAt: oldDate }),
    );

    part.decreaseStock(4);

    expect(part.getQuantity().getValue()).toBe(6);
    expect(part.getUpdatedAt().getTime()).toBeGreaterThan(oldDate.getTime());
  });

  it('refuses a withdrawal larger than the quantity without changing stock', () => {
    const part = Part.create(validProps({ quantity: 2 }));

    expect(() => part.decreaseStock(3)).toThrow(DomainException);
    expect(part.getQuantity().getValue()).toBe(2);
  });

  it('increases stock', () => {
    const part = Part.create(validProps({ quantity: 2 }));

    part.increaseStock(5);

    expect(part.getQuantity().getValue()).toBe(7);
  });

  it('updates the editable data and normalizes its value objects', () => {
    const part = Part.create(validProps());

    part.update({
      code: ' cabin-filter-456 ',
      name: ' Cabin filter ',
      description: '  Air conditioning filter  ',
      type: PartType.SUPPLY,
      unit: MeasurementUnit.KILOGRAM,
      unitPrice: '25.5',
      quantity: 4,
      minimumQuantity: 2,
    });

    expect(part.getCode().getValue()).toBe('CABIN-FILTER-456');
    expect(part.getName()).toBe('Cabin filter');
    expect(part.getDescription()).toBe('Air conditioning filter');
    expect(part.getType()).toBe(PartType.SUPPLY);
    expect(part.getUnit()).toBe(MeasurementUnit.KILOGRAM);
    expect(part.getUnitPrice().getValue()).toBe('25.50');
    expect(part.getQuantity().getValue()).toBe(4);
    expect(part.getMinimumQuantity().getValue()).toBe(2);
  });

  it('requires reordering at the minimum quantity or below', () => {
    expect(
      Part.create(
        validProps({ quantity: 3, minimumQuantity: 3 }),
      ).needsReorder(),
    ).toBe(true);
    expect(
      Part.create(
        validProps({ quantity: 4, minimumQuantity: 3 }),
      ).needsReorder(),
    ).toBe(false);
  });

  it.each([
    ['an empty name', { name: '   ' }],
    ['a negative quantity', { quantity: -1 }],
    ['a fractional minimum quantity', { minimumQuantity: 1.5 }],
  ])('rejects a part with %s', (_label, overrides) => {
    expect(() => Part.create(validProps(overrides))).toThrow(DomainException);
  });

  it.each([
    ['an invalid part type', { type: 'INVALID' as PartType }],
    ['an invalid measurement unit', { unit: 'INVALID' as MeasurementUnit }],
  ])(
    'rejects a part with %s received outside TypeScript',
    (_label, overrides) => {
      expect(() => Part.create(validProps(overrides))).toThrow(DomainException);
    },
  );
});
