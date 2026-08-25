## 📝 Resumo

Implementa os fluxos de notificação persistidos para orçamento disponível, peças aguardadas e link de pagamento gerado. Os e-mails são enviados por meio do contrato compartilhado do PR de Nodemailer e as entregas podem ser consultadas e reenviadas.

## 🔧 Alterações

- Cria o módulo `Notification`, com entidade, repositório Prisma, serviço, DTOs e endpoints para listar notificações e solicitar reenvio.
- Adiciona schema e migration para armazenar tipo, destinatário, conteúdo, status, tentativas e falhas de entrega.
- Envia orçamento ao cliente na primeira transição para `AWAITING_APPROVAL` e encaminha solicitação de peças ao e-mail do estoque em `AWAITING_PARTS`.
- Envia ao cliente a notificação de pagamento após a geração persistida do link de checkout.
- Atualiza README, testes unitários, e2e, de Swagger e fluxos integrados de oficina.

## 🏷️ Tipo de mudança

- [x] Feature
- [ ] Bug fix
- [ ] Refactor
- [x] Testes
- [x] Documentação
- [x] Configuração/infra

## ✅ Como testar

- [ ] `npm test -- --runInBand`
- [ ] `npm run test:e2e -- --runInBand`
- [ ] `npm run build`

Os comandos foram executados, mas não puderam iniciar porque o `node_modules` local está incompleto e pertence a `root`: `jest`, `cross-env` e `prisma` não foram encontrados. Após executar `npm ci`, rode `npx prisma generate`, aplique a migration de notificações e execute os comandos acima.

## 👀 Observações

- Este é o segundo PR da pilha e deve ter `feat/notification-nodemailer` como base.
- A migration `20260823010000_add_notifications` precisa estar aplicada antes de testar os fluxos integrados.
- Para o MVP acadêmico, Ethereal permite validar os e-mails sem entrega a caixas reais; configure também `STOCK_NOTIFICATION_EMAIL` para o fluxo de peças.
- O envio fica registrado com status e erro de entrega, permitindo consulta e reenvio pelos endpoints do módulo de notificações.

## 📋 Checklist

- [x] A mudança está coerente com o escopo do PR
- [x] Testes foram adicionados ou atualizados quando necessário
- [x] A documentação/Swagger foi atualizada quando aplicável
- [ ] Impactos em Prisma/schema/migrations foram avaliados quando aplicável
- [x] Foram avaliados riscos de regressão ou efeitos colaterais

O schema e a migration foram revisados no diff, mas a validação do Prisma não pôde ser executada no ambiente atual pela ausência do executável no `node_modules`.
