export abstract class PartCatalogPort {
  abstract exists(partId: string): Promise<boolean>;
}
