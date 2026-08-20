import {
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  INestApplication,
  Injectable,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { CurrentUser } from './current-user.decorator';

@Injectable()
class TestIdentityGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    context.switchToHttp().getRequest().user = {
      id: 'admin-id',
      role: 'ADMIN',
      internal: 'must-not-leak',
    };
    return true;
  }
}

@Controller('current-user-test')
class CurrentUserTestController {
  @Get()
  @UseGuards(TestIdentityGuard)
  currentUser(@CurrentUser() user: { id: string; role: string }): {
    id: string;
    role: string;
  } {
    return user;
  }
}

describe('@CurrentUser', () => {
  let app: INestApplication<App>;
  let http: App;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      controllers: [CurrentUserTestController],
      providers: [TestIdentityGuard],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it('exposes only id and role from the authenticated request', async () => {
    await request(http)
      .get('/current-user-test')
      .expect(200, { id: 'admin-id', role: 'ADMIN' });
  });
});
