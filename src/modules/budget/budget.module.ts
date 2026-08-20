import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { BudgetController } from './controllers/budget.controller';
import { BudgetRepository } from './repositories/budget.repository';
import { BudgetService } from './services/budget.service';

@Module({
  imports: [PrismaModule],
  controllers: [BudgetController],
  providers: [BudgetService, BudgetRepository],
})
export class BudgetModule {}
