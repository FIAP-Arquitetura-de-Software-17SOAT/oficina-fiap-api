import { AverageExecutionTime } from '../contracts/service-order.input';
import { ServiceOrderRepositoryPort } from '../ports/service-order-repository.port';

export class GetAverageExecutionTimeUseCase {
  constructor(private readonly serviceOrders: ServiceOrderRepositoryPort) {}

  async execute(): Promise<AverageExecutionTime> {
    const completed = await this.serviceOrders.findCompleted();

    if (completed.length === 0) {
      return { averageExecutionTimeMs: null, sampleSize: 0 };
    }

    // O timer do board começa na atribuição ao mecânico, não na abertura da OS.
    const totalMs = completed.reduce(
      (sum, serviceOrder) => sum + (serviceOrder.getExecutionTimeMs() ?? 0),
      0,
    );

    return {
      averageExecutionTimeMs: Math.round(totalMs / completed.length),
      sampleSize: completed.length,
    };
  }
}
