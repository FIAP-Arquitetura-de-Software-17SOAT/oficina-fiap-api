import { Role } from '../../../../generated/prisma/enums';
import { ROLES_KEY, Roles } from './roles.decorator';

describe('@Roles', () => {
  it('attaches the accepted roles to the protected handler', () => {
    class TestController {
      @Roles(Role.ADMIN)
      protectedRoute(this: void): void {}
    }

    expect(
      Reflect.getMetadata(ROLES_KEY, TestController.prototype.protectedRoute),
    ).toEqual(['ADMIN']);
  });
});
