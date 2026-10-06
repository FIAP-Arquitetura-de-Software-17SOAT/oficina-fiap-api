/**
 * Módulos que já seguem Clean Architecture e por isso passam pelo teste de
 * fronteira de imports. Cada PR de migração acrescenta o seu módulo aqui.
 */
export const MIGRATED_MODULES = [
  'client',
  'vehicle',
  'service-catalog',
  'notification',
  'parts-dispatch',
] as const;

export type MigratedModule = (typeof MIGRATED_MODULES)[number];
