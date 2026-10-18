import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from './shared/http/auth/public.decorator';
import { PrismaService } from './shared/database/prisma.service';
import { API_PREFIX } from './setup-app';

@Public()
@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }

    return { status: 'ok' };
  }

  @Get(`${API_PREFIX}/health`)
  healthV1() {
    return this.health();
  }

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get(`${API_PREFIX}/live`)
  liveV1() {
    return this.live();
  }
}
