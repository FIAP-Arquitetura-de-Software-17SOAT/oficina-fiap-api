# Modulo Notification

Quarto modulo migrado. E uma folha do grafo (nao depende de nenhum modulo) e tres modulos legados dependem dele (`service-order`, `budget`, `billing`) para disparar e-mails. Traz duas novidades: a **infraestrutura de e-mail sai de `shared` e entra no modulo**, e aparece a primeira **porta de logger**, porque o envio engole erros e registra em log. A regra geral esta em [Migracao para Clean Architecture](../migracao-clean-architecture.md).

## Estrutura

```text
src/modules/notification/
  domain/
    entities/notification.entity.ts
    enums/notification-status.enum.ts
    enums/notification-type.enum.ts
  application/
    use-cases/enqueue-notification.use-case.ts
    use-cases/list-notifications.use-case.ts
    use-cases/retry-notification.use-case.ts
    services/notification-delivery.ts
    ports/notification-repository.port.ts
    ports/email-sender.port.ts
    contracts/notification.input.ts
    errors/notification-application.error.ts
  infrastructure/
    persistence/prisma-notification.repository.ts
    persistence/notification-persistence.mapper.ts
    email/nodemailer-email-sender.ts
  presentation/http/
    notification.controller.ts
    dto/notification.dto.ts
    mappers/notification-response.mapper.ts
  notification.module.ts

src/shared/
  application/logger.port.ts
  infrastructure/logging/nest-logger.adapter.ts
```

## O que mudou em relacao ao layout legado

| Antes | Depois |
| --- | --- |
| `entities/`, `enums/` | `domain/entities/`, `domain/enums/`, movidos sem alteracao |
| `services/notification.service.ts`: `enqueue`, `findAll`, `retry` numa classe `@Injectable` com `Logger` do Nest e exceções HTTP | `application/use-cases/`: `EnqueueNotification`, `ListNotifications`, `RetryNotification`; a entrega e o compare-and-set compartilhados ficam em `application/services/notification-delivery.ts` |
| `Logger` do Nest dentro do service | `LoggerPort` em `src/shared/application`, implementada por `NestLoggerAdapter` em `src/shared/infrastructure/logging` |
| `src/shared/notifications/email/email-sender.ts` (abstrato) e `EmailModule` | `application/ports/email-sender.port.ts` (`EmailSenderPort`); o `EmailModule` deixou de existir e o `NotificationModule` liga a porta ao `NodemailerEmailSender` |
| `src/shared/notifications/email/nodemailer-email-sender.ts` | `infrastructure/email/nodemailer-email-sender.ts`, movido sem alteracao alem do `extends` |
| `repositories/notification.repository.ts` concreto, exportado pelo modulo | `application/ports/notification-repository.port.ts` e `infrastructure/persistence/prisma-notification.repository.ts` |
| `mappers/notification.mapper.ts` misturava persistencia e resposta HTTP | `infrastructure/persistence/notification-persistence.mapper.ts` e `presentation/http/mappers/notification-response.mapper.ts` |
| Modulo exportava `NotificationService` e `NotificationRepository` | Modulo exporta so `EnqueueNotificationUseCase` |

Contratos HTTP, mensagens publicas, schema e migrations nao mudaram. Os templates de e-mail continuam em `src/shared/notifications/email/notification-templates.ts` ate cada consumidor ser migrado e levar o seu.

## Por que uma porta de logger

`EnqueueNotificationUseCase` nunca rejeita quem chamou: uma falha de SMTP nao pode desfazer a transicao de negocio que disparou o e-mail. O caso de uso engole o erro, grava o estado `FAILED` para reenvio manual e registra em log. Sem porta, isso obrigaria `application/` a importar o `Logger` do Nest, o que o teste de fronteira proibe.

```typescript
// src/shared/application/logger.port.ts
export abstract class LoggerPort {
  abstract error(details: Record<string, unknown>, message: string): void;
}
```

O `NotificationModule` liga a porta com `new NestLoggerAdapter('NotificationService')`, entao o contexto dos logs continua o mesmo de antes.

## Erros

| Codigo | `kind` | Status | Mensagem |
| --- | --- | --- | --- |
| `NOTIFICATION_NOT_FOUND` | `NOT_FOUND` | 404 | `Notificação não encontrada` |
| `NOTIFICATION_NOT_FAILED` | `CONFLICT` | 409 | `Somente notificação que falhou pode ser reenviada` |
| `NOTIFICATION_CONCURRENT_UPDATE` | `CONFLICT` | 409 | `A notificação foi alterada por outro envio` |

No envio inicial, `NOTIFICATION_CONCURRENT_UPDATE` nunca chega ao HTTP: e capturado e vira log. No reenvio, chega ao operador como 409.

## Quem consome o modulo

`service-order`, `budget` e `billing` injetam `EnqueueNotificationUseCase` e chamam `execute(input)` com `type`, `to`, `subject`, `text` e `html`. Ainda sao legados; ao migrar, cada um declara a propria porta com nomes de negocio (`statusChanged`, `budgetReady`, `paymentLinkReady`) e o adapter e quem monta o e-mail. Nos testes E2E, o caso de uso e substituido por `{ execute: jest.fn() }`; a suite de orcamento que exercita o envio de verdade sobrescreve `NotificationRepositoryPort` e `EmailSenderPort`.

## Testes

- Casos de uso: `application/use-cases/notification-use-cases.spec.ts`, com repositorio, e-mail e logger falsos. Cobre envio, falha de SMTP, falha de persistencia nos dois caminhos e as corridas do compare-and-set.
- Logger: `src/shared/infrastructure/logging/nest-logger.adapter.spec.ts`.
- Fronteira de imports: `notification` listado em `test/architecture/migrated-modules.ts`; `src/shared/application` tambem e verificado.
