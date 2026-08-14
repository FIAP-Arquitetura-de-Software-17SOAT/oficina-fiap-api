import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '../../../../generated/prisma/enums';

export interface AuthenticatedUser {
  id: string;
  role: Role;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const user = context
      .switchToHttp()
      .getRequest<{ user: AuthenticatedUser }>().user;

    return { id: user.id, role: user.role };
  },
);
