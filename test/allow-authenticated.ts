import { ExecutionContext } from '@nestjs/common';
import { TestingModuleBuilder } from '@nestjs/testing';
import { JwtAuthGuard } from '../src/shared/http/auth/jwt-auth.guard';

/**
 * Libera o guard global nos e2e que exercitam regra de negócio, injetando um
 * administrador autenticado na request — o RolesGuard continua rodando de
 * verdade em cima desse usuário.
 *
 * Quem testa a proteção em si (auth.e2e-spec, stock.e2e-spec e
 * authorization.e2e-spec) não usa este helper.
 */
export const allowAuthenticated = (
  builder: TestingModuleBuilder,
): TestingModuleBuilder =>
  // overrideProvider, e não overrideGuard: o guard é global (APP_GUARD), e o
  // overrideGuard só alcança guards presos a um controller com @UseGuards.
  builder.overrideProvider(JwtAuthGuard).useValue({
    canActivate: (context: ExecutionContext) => {
      context.switchToHttp().getRequest<{ user?: unknown }>().user = {
        sub: 'e2e-user',
        role: 'ADMIN',
        type: 'access',
        jti: 'e2e-jti',
      };

      return true;
    },
  });
