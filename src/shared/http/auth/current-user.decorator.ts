import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '../../../../generated/prisma/enums';

export interface AuthenticatedUser {
  id: string;
  role: Role;
  /** Presente só no CUSTOMER: o cliente dono do login. */
  clientId?: string;
}

/**
 * O recorte de dados de quem chama: o cliente do CUSTOMER, ou `undefined` para
 * a oficina (ADMIN e EMPLOYEE), que enxerga tudo.
 */
export const clientScopeOf = (
  user: AuthenticatedUser | undefined,
): string | undefined =>
  user?.role === Role.CUSTOMER ? user.clientId : undefined;

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const user = context
      .switchToHttp()
      .getRequest<{ user: AuthenticatedUser }>().user;

    return user.clientId === undefined
      ? { id: user.id, role: user.role }
      : { id: user.id, role: user.role, clientId: user.clientId };
  },
);
