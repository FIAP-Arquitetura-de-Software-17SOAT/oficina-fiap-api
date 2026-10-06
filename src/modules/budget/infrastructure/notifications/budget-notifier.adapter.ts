import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isEmail } from 'class-validator';
import { API_PREFIX } from '../../../../setup-app';
import { FindClientUseCase } from '../../../client/application/use-cases/find-client.use-case';
import { NotificationType } from '../../../notification/domain/enums/notification-type.enum';
import { EnqueueNotificationUseCase } from '../../../notification/application/use-cases/enqueue-notification.use-case';
import { FindServiceOrderUseCase } from '../../../service-order/application/use-cases/find-service-order.use-case';
import {
  BudgetNotifierPort,
  BudgetReadyNotice,
  StockPartsRequestedNotice,
} from '../../application/ports/budget-notifier.port';
import { budgetReadyEmail, stockPartsRequestedEmail } from './budget.emails';

/**
 * Tudo que o caso de uso não deve conhecer mora aqui: o e-mail do cliente
 * (via OS → cliente), a URL pública do link de aprovação, o e-mail do estoque
 * na configuração e os templates. Nunca lança: o resultado de negócio já foi
 * gravado, e o módulo de notificação guarda a falha para reenvio.
 */
@Injectable()
export class BudgetNotifierAdapter implements BudgetNotifierPort {
  constructor(
    private readonly config: ConfigService,
    private readonly findServiceOrder: FindServiceOrderUseCase,
    private readonly findClient: FindClientUseCase,
    private readonly notifications: EnqueueNotificationUseCase,
  ) {}

  async budgetReady(notice: BudgetReadyNotice): Promise<void> {
    try {
      const serviceOrder = await this.findServiceOrder.execute(
        notice.serviceOrderId,
      );
      const client = await this.findClient.execute(serviceOrder.getClientId());

      await this.notifications.execute({
        type: NotificationType.BUDGET_READY,
        to: client.getEmail().getValue(),
        ...budgetReadyEmail({
          serviceOrderId: notice.serviceOrderId,
          items: notice.items,
          total: notice.total,
          approvalUrl: this.approvalUrl(notice.approvalToken),
          approvalExpiresAt: notice.approvalExpiresAt,
        }),
      });
    } catch {
      // O envio do orçamento já foi gravado; o aviso é consequência.
    }
  }

  async stockPartsRequested(notice: StockPartsRequestedNotice): Promise<void> {
    try {
      const stockEmail = this.config
        .get<string>('STOCK_NOTIFICATION_EMAIL')
        ?.trim();
      if (!stockEmail || !isEmail(stockEmail)) return;

      await this.notifications.execute({
        type: NotificationType.STOCK_PARTS_REQUESTED,
        to: stockEmail,
        ...stockPartsRequestedEmail(notice),
      });
    } catch {
      // O aceite e a transição da OS já ocorreram; o aviso é consequência.
    }
  }

  /**
   * A página de confirmação atende o GET do link: abrir o link não decide nada
   * (scanners de email abrem links sozinhos), só o POST da página decide.
   */
  private approvalUrl(token: string): string {
    const base = (
      this.config.get<string>('PUBLIC_API_URL')?.trim() ||
      'http://localhost:3000'
    ).replace(/\/+$/, '');
    return `${base}/${API_PREFIX}/budgets/webhooks/decision?token=${token}`;
  }
}
