export abstract class ServiceOrderDispatchPort {
  abstract registerPartsDispatched(serviceOrderId: string): Promise<void>;
}
