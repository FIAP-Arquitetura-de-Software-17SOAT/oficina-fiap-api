import { Module } from '@nestjs/common';
import { PartRepository } from './repositories/part.repository';
import { PartService } from './services/part.service';

@Module({
  providers: [PartService, PartRepository],
  exports: [PartService],
})
export class StockModule {}
