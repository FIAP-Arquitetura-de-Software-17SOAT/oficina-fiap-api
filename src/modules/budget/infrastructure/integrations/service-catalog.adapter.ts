import { Injectable } from '@nestjs/common';
import { ServiceCatalogApplicationError } from '../../../service-catalog/application/errors/service-catalog-application.error';
import { FindServiceUseCase } from '../../../service-catalog/application/use-cases/find-service.use-case';
import { ServiceCatalogPort } from '../../application/ports/service-catalog.port';

@Injectable()
export class ServiceCatalogAdapter implements ServiceCatalogPort {
  constructor(private readonly findService: FindServiceUseCase) {}

  async exists(serviceId: string): Promise<boolean> {
    try {
      await this.findService.execute(serviceId);
      return true;
    } catch (error) {
      if (
        error instanceof ServiceCatalogApplicationError &&
        error.code === 'SERVICE_NOT_FOUND'
      ) {
        return false;
      }
      throw error;
    }
  }
}
