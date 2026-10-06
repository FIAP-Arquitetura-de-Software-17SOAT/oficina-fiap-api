export abstract class ServiceCatalogPort {
  abstract exists(serviceId: string): Promise<boolean>;
}
