import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PartController } from './controllers/part.controller';
import { PartRepository } from './repositories/part.repository';
import { PartService } from './services/part.service';

@Module({
  imports: [AuthModule],
  controllers: [PartController],
  providers: [PartService, PartRepository],
  exports: [PartService],
})
export class StockModule {}
