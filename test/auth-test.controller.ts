import { Controller, Get, Module, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Role } from '../generated/prisma/enums';
import { AuthModule } from '../src/modules/auth/auth.module';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../src/shared/http/auth/current-user.decorator';
import { JwtAuthGuard } from '../src/shared/http/auth/jwt-auth.guard';
import { Roles } from '../src/shared/http/auth/roles.decorator';
import { RolesGuard } from '../src/shared/http/auth/roles.guard';

@Controller('test-auth')
export class AuthTestController {
  @Get('authenticated')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Test-only authenticated endpoint' })
  @ApiOkResponse({ description: 'Authenticated identity' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  authenticated(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Test-only administrator endpoint' })
  @ApiOkResponse({ description: 'Administrator accepted' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Authenticated role is not allowed' })
  admin(): { authorized: true } {
    return { authorized: true };
  }
}

@Module({
  imports: [AuthModule],
  controllers: [AuthTestController],
})
export class AuthTestModule {}
