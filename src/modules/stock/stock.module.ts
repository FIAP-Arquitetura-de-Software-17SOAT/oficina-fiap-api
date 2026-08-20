import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PartController } from './controllers/part.controller';
import { PartRepository } from './repositories/part.repository';
import { StockMovementRepository } from './repositories/stock-movement.repository';
import { PartService } from './services/part.service';
import { StockMovementService } from './services/stock-movement.service';

@Module({
  imports: [AuthModule],
  controllers: [PartController],
  providers: [
    PartService,
    PartRepository,
    StockMovementService,
    StockMovementRepository,
  ],
  exports: [PartService, StockMovementService],
})
export class StockModule {}
