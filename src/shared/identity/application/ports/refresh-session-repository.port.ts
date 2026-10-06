import { RefreshSession } from '../../domain/entities/refresh-session.entity';

export abstract class RefreshSessionRepositoryPort {
  abstract create(session: RefreshSession): Promise<RefreshSession>;
  abstract findByJti(jti: string): Promise<RefreshSession | null>;
  abstract revoke(jti: string, revokedAt: Date): Promise<void>;
  /**
   * Rotação atômica do refresh token: revoga a sessão consumida e grava a
   * substituta na mesma transação. Devolve `false`, sem gravar nada, quando a
   * sessão consumida já estava revogada ou vencida — duas renovações
   * concorrentes com o mesmo token só rendem uma sessão nova.
   */
  abstract rotate(
    consumedJti: string,
    revokedAt: Date,
    replacement: RefreshSession,
  ): Promise<boolean>;
}
