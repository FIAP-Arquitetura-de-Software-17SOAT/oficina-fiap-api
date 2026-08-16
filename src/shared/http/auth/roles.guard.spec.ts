import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../../../generated/prisma/enums';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

class PublicController {
  route(): void {}
}

class AdminController {
  @Roles(Role.ADMIN)
  route(): void {}
}

function contextFor(
  controller: object,
  user?: { id: string; role: string },
): ExecutionContext {
  const handler = Object.getPrototypeOf(controller).route as () => void;

  return {
    getHandler: () => handler,
    getClass: () => controller.constructor,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as never;
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('does not add authorization requirements without role metadata', () => {
    expect(guard.canActivate(contextFor(new PublicController()))).toBe(true);
  });

  it('allows an authenticated user with an accepted role', () => {
    expect(
      guard.canActivate(
        contextFor(new AdminController(), { id: 'admin-id', role: 'ADMIN' }),
      ),
    ).toBe(true);
  });

  it('denies an authenticated user whose role is not accepted', () => {
    expect(
      guard.canActivate(
        contextFor(new AdminController(), {
          id: 'customer-id',
          role: 'CUSTOMER',
        }),
      ),
    ).toBe(false);
  });
});
