/**
 * O que o módulo de veículos precisa saber sobre clientes: só se o dono
 * informado existe. A porta é estreita de propósito; o adapter em
 * `infrastructure/integrations` é quem conhece o módulo de clientes.
 */
export abstract class ClientLookupPort {
  abstract exists(clientId: string): Promise<boolean>;
}
