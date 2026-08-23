# Notificações por E-mail — Design

## Objetivo

Enviar e-mails transacionais para clientes e para o time de estoque sem tornar
as transições de orçamento, cobrança ou ordem de serviço dependentes do SMTP.

## Escopo

O MVP cobre três eventos:

1. A criação do primeiro orçamento move a ordem de serviço para
   `AWAITING_APPROVAL` e agenda um e-mail detalhado do orçamento ao cliente.
2. A cobrança de uma OS concluída persiste o link Stripe e agenda um e-mail ao
   cliente informando a finalização do serviço e contendo o link de pagamento.
3. O aceite de orçamento move a OS para `AWAITING_PARTS` e agenda um e-mail à
   caixa compartilhada do estoque com a solicitação de peças.

O escopo não inclui um provedor de mensageria externo, SMS, WhatsApp, Slack,
Teams, templates visuais externos ou agendamento automático recorrente.

## Decisão de Entrega

Cada notificação será persistida antes da tentativa de envio. O fluxo de
negócio não falha se o SMTP estiver indisponível: a notificação fica marcada
como `FAILED`, com erro e contador de tentativas, para reenvio administrativo.
Em caso de sucesso, seu estado passa a `SENT`.

Uma rota administrativa listará notificações e outra acionará o reenvio de uma
notificação falha. A tentativa inicial é síncrona após a persistência da
transição de negócio; falhas são absorvidas e registradas. Não haverá job ou
worker no MVP.

## Arquitetura

`src/shared/notifications` será infraestrutura compartilhada, sem conhecer
Cliente, Orçamento, Cobrança, Estoque ou Ordem de Serviço. Ele expõe uma porta
de envio de e-mail e uma implementação SMTP com Nodemailer.

O módulo `notifications` conterá a entidade e repositório de entrega, a
orquestração de persistir/tentar/retry e a API administrativa. Os módulos
Budget e Billing continuam donos do carregamento dos dados de seus casos de
uso e produzem o conteúdo da notificação. A solicitação ao estoque será
produzida pelo fluxo de aceite de orçamento, onde a mudança para
`AWAITING_PARTS` ocorre hoje.

O módulo central recebe somente dados de transporte (`to`, `subject`, `text`,
`html` e tipo); ele não consulta agregados de outros módulos. Isso preserva as
fronteiras do monólito modular e evita dependências circulares.

## Modelo de Dados

Uma tabela `notification` terá, no mínimo:

- `id` UUID;
- `type`: `BUDGET_READY`, `PAYMENT_LINK_READY` ou `STOCK_PARTS_REQUESTED`;
- `status`: `PENDING`, `SENT` ou `FAILED`;
- destinatário, assunto, conteúdo texto e HTML;
- `attempts`, `lastError`, `sentAt`, `createdAt`, `updatedAt`.

O conteúdo é salvo no momento do evento. Reenvios, portanto, repetem a mesma
mensagem que foi originalmente gerada, mesmo que orçamento ou cliente mudem
depois.

## SMTP e Configuração

O envio usa Nodemailer e as seguintes variáveis:

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`;
- `MAIL_FROM`;
- `STOCK_NOTIFICATION_EMAIL`.

`SMTP_SECURE` será booleano explícito; `MAIL_FROM` e
`STOCK_NOTIFICATION_EMAIL` serão endereços válidos. As configurações SMTP são
validadas quando o transportador é usado. Testes substituirão a porta de
e-mail por um fake, sem conexão SMTP.

## Conteúdo das Mensagens

O e-mail de orçamento informa cliente, identificador da OS, versão, lista de
itens (descrição, quantidade, valor unitário e subtotal) e total calculado.
O e-mail de pagamento informa que a OS foi finalizada, valor total e o link
Stripe persistido. O e-mail ao estoque informa a OS e apenas os itens do tipo
`PART`, incluindo quantidade e descrição.

## Ramificações

Não serão usados worktrees.

1. `feat/notification-nodemailer`: dependência Nodemailer, porta SMTP,
   configuração e testes unitários de infraestrutura. Não altera fluxos de
   negócio ou schema.
2. `feat/notification-flows`: criada a partir da primeira branch; migration e
   módulo de notificações, reenvio administrativo e integrações Budget/Billing
   para os três eventos.

## Erros e Observabilidade

Erros de SMTP nunca são retornados como falha dos endpoints de orçamento ou
cobrança. O erro é persistido em `lastError` e registrado em log estruturado
com o ID da notificação e seu tipo. Um reenvio só é permitido no estado
`FAILED`; a tentativa e seu resultado atualizam a mesma notificação.

## Testes

A infraestrutura terá testes do mapeamento para Nodemailer e validação de
configuração. O módulo de notificações terá testes de estados, falha e
reenvio. Budget, Billing e integração E2E verificarão que cada evento cria a
notificação correta, que falha de SMTP não desfaz o estado de negócio e que o
reenvio muda uma notificação falha para `SENT`.
