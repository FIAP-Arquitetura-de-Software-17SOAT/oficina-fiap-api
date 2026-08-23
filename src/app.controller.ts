import { Controller, Get } from '@nestjs/common';
import { Public } from './shared/http/auth/public.decorator';

@Public()
@Controller()
export class AppController {
  constructor() {}

  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
