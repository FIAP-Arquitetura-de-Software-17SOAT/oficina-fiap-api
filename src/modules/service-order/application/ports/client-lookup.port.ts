export abstract class ClientLookupPort {
  abstract exists(clientId: string): Promise<boolean>;
}
