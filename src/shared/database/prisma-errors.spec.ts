import {
  isForeignKeyViolation,
  isUniqueViolation,
  uniqueViolationFields,
} from './prisma-errors';

describe('prisma-errors', () => {
  describe('isUniqueViolation', () => {
    it('reconhece P2002', () => {
      expect(isUniqueViolation({ code: 'P2002' })).toBe(true);
    });

    it.each([
      [{ code: 'P2003' }, 'outro código do Prisma'],
      [new Error('boom'), 'erro comum'],
      [null, 'nulo'],
      [undefined, 'indefinido'],
      ['P2002', 'string solta'],
    ])('não reconhece %p (%s)', (input) => {
      expect(isUniqueViolation(input)).toBe(false);
    });
  });

  describe('isForeignKeyViolation', () => {
    it('reconhece P2003', () => {
      expect(isForeignKeyViolation({ code: 'P2003' })).toBe(true);
    });

    it('não confunde com P2002', () => {
      expect(isForeignKeyViolation({ code: 'P2002' })).toBe(false);
    });

    it('não quebra com nulo', () => {
      expect(isForeignKeyViolation(null)).toBe(false);
    });
  });

  describe('uniqueViolationFields', () => {
    it('extrai as colunas quando target é array', () => {
      expect(
        uniqueViolationFields({ code: 'P2002', meta: { target: ['email'] } }),
      ).toEqual(['email']);
    });

    it('aceita target como string', () => {
      expect(
        uniqueViolationFields({
          code: 'P2002',
          meta: { target: 'client_email_key' },
        }),
      ).toEqual(['client_email_key']);
    });

    it('descarta entradas do array que não são string', () => {
      expect(
        uniqueViolationFields({
          code: 'P2002',
          meta: { target: ['email', 42, null] },
        }),
      ).toEqual(['email']);
    });

    it.each([
      [{ code: 'P2002' }, 'sem meta'],
      [{ code: 'P2002', meta: {} }, 'sem target'],
      [{ code: 'P2002', meta: { target: 7 } }, 'target de tipo inesperado'],
      [null, 'nulo'],
    ])('devolve lista vazia para %p (%s)', (input) => {
      expect(uniqueViolationFields(input)).toEqual([]);
    });
  });
});
