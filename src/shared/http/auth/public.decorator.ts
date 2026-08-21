import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Libera a rota do guard global de autenticação.
 *
 * O padrão é o contrário: toda rota exige token. Só o health check e os
 * próprios endpoints de autenticação ficam abertos — quem ainda não tem token
 * não teria como pedir um.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
