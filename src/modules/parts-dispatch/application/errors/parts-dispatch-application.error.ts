import {
  ApplicationError,
  ApplicationErrorKind,
} from '../../../../shared/application/application.error';

export type PartsDispatchErrorCode =
  'NO_ACCEPTED_BUDGET' | 'PART_ITEM_WITHOUT_REFERENCE' | 'PART_NOT_FOUND';

export interface PartsDispatchErrorParams {
  descriptions?: string[];
}

const catalog: Record<
  PartsDispatchErrorCode,
  {
    kind: ApplicationErrorKind;
    message: (p: PartsDispatchErrorParams) => string;
  }
> = {
  NO_ACCEPTED_BUDGET: {
    kind: 'INVALID',
    message: () => 'Service order has no accepted budget to dispatch parts for',
  },
  PART_ITEM_WITHOUT_REFERENCE: {
    kind: 'INVALID',
    message: (p) =>
      `Accepted budget has part items without a part reference: ${(
        p.descriptions ?? []
      ).join(', ')}`,
  },
  PART_NOT_FOUND: { kind: 'NOT_FOUND', message: () => 'Peça não encontrada' },
};

export class PartsDispatchApplicationError extends ApplicationError {
  declare readonly code: PartsDispatchErrorCode;

  constructor(
    code: PartsDispatchErrorCode,
    params: PartsDispatchErrorParams = {},
  ) {
    super(code, catalog[code].kind, catalog[code].message(params));
  }
}
