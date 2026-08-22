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
      { input: { code: 'P2003' }, label: 'outro código do Prisma' },
      { input: new Error('boom'), label: 'erro comum' },
      { input: null, label: 'nulo' },
      { input: undefined, label: 'indefinido' },
      { input: 'P2002', label: 'string solta' },
    ])('não reconhece $label', ({ input }) => {
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
      { input: { code: 'P2002' }, label: 'sem meta' },
      { input: { code: 'P2002', meta: {} }, label: 'sem target' },
      {
        input: { code: 'P2002', meta: { target: 7 } },
        label: 'target de tipo inesperado',
      },
      { input: null, label: 'nulo' },
    ])('devolve lista vazia para $label', ({ input }) => {
      expect(uniqueViolationFields(input)).toEqual([]);
    });
  });
});
