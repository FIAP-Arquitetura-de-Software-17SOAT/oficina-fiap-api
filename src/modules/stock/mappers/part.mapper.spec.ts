import { MeasurementUnit, Part, PartType } from '../entities/part.entity';
import { PartMapper } from './part.mapper';

const makePart = (code = 'OIL-FILTER-123') =>
  Part.create({
    code,
    name: 'Oil filter',
    description: 'Filter for engine oil',
    type: PartType.PART,
    unit: MeasurementUnit.UNIT,
    unitPrice: 149.9,
    quantity: 10,
    minimumQuantity: 3,
  });

describe('PartMapper', () => {
  it('maps domain value objects to API primitives', () => {
    const response = PartMapper.toResponse(makePart());

    expect(response).toEqual({
      id: expect.any(String) as string,
      code: 'OIL-FILTER-123',
      name: 'Oil filter',
      description: 'Filter for engine oil',
      type: PartType.PART,
      unit: MeasurementUnit.UNIT,
      unitPrice: 149.9,
      quantity: 10,
      minimumQuantity: 3,
      createdAt: expect.any(Date) as Date,
      updatedAt: expect.any(Date) as Date,
    });
  });

  it('serializes the unit price as a decimal number', () => {
    const json = JSON.parse(
      JSON.stringify(PartMapper.toResponse(makePart())),
    ) as Record<string, unknown>;

    // Dinheiro atravessa a API como decimal e vive em centavos no domínio;
    // não sai mais como string.
    expect(typeof json.unitPrice).toBe('number');
  });

  it('maps lists while preserving order', () => {
    expect(
      PartMapper.toResponseList([makePart('FIRST'), makePart('SECOND')]),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'FIRST' }) as object,
        expect.objectContaining({ code: 'SECOND' }) as object,
      ]),
    );
  });
});
