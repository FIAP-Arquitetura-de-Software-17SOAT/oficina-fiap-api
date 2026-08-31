# Coleção do Postman

A coleção **Oficina FIAP — Fluxo E2E** exercita a API inteira de ponta a ponta:
do login à entrega da ordem de serviço, com o pagamento no Stripe no meio do
caminho. É o complemento prático do Swagger — o Swagger mostra o contrato de
cada endpoint isoladamente, a coleção mostra a ordem em que eles fazem sentido.

| Item | Onde |
|---|---|
| Arquivo | [`postman/Oficina FIAP — Fluxo E2E.postman_collection.json`](../../postman/Oficina%20FIAP%20%E2%80%94%20Fluxo%20E2E.postman_collection.json) |
| Formato | Postman Collection v2.1 |
| Conteúdo | 16 requests do fluxo E2E (numerados `00`–`15`) e 47 requests de referência em 11 pastas |

O arquivo é versionado no repositório. **Ao mudar um endpoint, reexporte a
coleção** — senão ela passa a documentar uma API que não existe mais.

## Antes de começar

1. A API precisa estar no ar em `http://localhost:3000/api/v1` (`docker compose up --build`).
2. O administrador inicial precisa existir — o Compose cria a partir de `ADMIN_EMAIL` e `ADMIN_PASSWORD`.
3. O passo `15` e a pasta *Retorno do checkout* dependem do Stripe; veja [Pagamento](#pagamento-stripe).

## Importar e configurar

No Postman: **Import → File →** selecione o `.json` da pasta `postman/`.

A coleção já traz todas as variáveis que ela mesma preenche durante a execução
(ids, tokens, CPF, placa...). **Duas variáveis não vêm no arquivo e precisam ser
criadas por você**, num *environment* do Postman ou nas variáveis da própria
coleção:

| Variável | Valor | Por quê |
|---|---|---|
| `email` | o mesmo de `ADMIN_EMAIL` no `.env` | credencial do passo `01 · Login` |
| `password` | o mesmo de `ADMIN_PASSWORD` no `.env` | idem |

Elas ficam de fora de propósito: são credenciais e mudam de máquina para
máquina. Sem preenchê-las, o passo `01` sai com o literal `{{email}}` no corpo e
o fluxo inteiro para ali.

A única outra variável que talvez você queira ajustar é `baseUrl`, que já vem com
`http://localhost:3000/api/v1`.

A autenticação está configurada no nível da coleção (Bearer `{{accessToken}}`),
então todo request herda o token que o passo `01` grava. As rotas públicas
— health check, login, refresh, logout, webhook do Stripe e os retornos de
checkout — funcionam com ou sem ele.

## O fluxo E2E

Os requests `00`–`15` estão na raiz da coleção e formam uma sequência: cada um
grava em variáveis o que o próximo consome, e um teste que falha interrompe a
execução (`postman.setNextRequest(null)`) em vez de deixar a corrida seguir com
lixo. Rode-os de cima para baixo — no Collection Runner, **desmarque as pastas**
e deixe só os numerados, que as pastas são material de consulta e não fazem
parte do roteiro.

| Passo | Endpoint | O que faz | Status da OS depois |
|---|---|---|---|
| `00` | `GET /health` | Confere se a API responde e sorteia os dados da rodada | — |
| `01` | `POST /auth/login` | Guarda `accessToken` e `refreshToken` | — |
| `02` | `POST /clients` | Cria a cliente Maria Silva | — |
| `03` | `POST /vehicles` | Cadastra o veículo dela | — |
| `04` | `POST /services` | Põe "Troca de óleo e filtro" no catálogo, a R$ 149,90 | — |
| `05` | `POST /parts` | Cadastra o filtro de óleo, a R$ 49,90 | — |
| `06` | `POST /parts/:id/movements/in` | Dá entrada de 10 unidades no estoque | — |
| `07` | `POST /service-orders` | Abre a OS | `RECEIVED` |
| `08` | `PATCH /service-orders/:id/assign` | Atribui o mecânico e começa o diagnóstico | `IN_DIAGNOSIS` |
| `09` | `POST /budgets` | Gera o orçamento (serviço + peça = R$ 199,80) | `AWAITING_APPROVAL` |
| `10` | `POST /budgets/:id/send` | Envia o orçamento ao cliente por e-mail | `AWAITING_APPROVAL` |
| `11` | `POST /budgets/:id/accept` | Cliente aprova | `AWAITING_PARTS` |
| `12` | `POST /parts/service-orders/:id/dispatch` | Baixa as peças do estoque | `IN_PROGRESS` |
| `13` | `PATCH /service-orders/:id/complete` | Finaliza o serviço e registra `executionTimeMs` | `COMPLETED` |
| `14` | `POST /billings` | Gera a cobrança e a sessão de checkout do Stripe | `COMPLETED` |
| `15` | `POST /billings/:id/deliver-service-order` | Entrega o veículo (exige cobrança `PAID`) | `DELIVERED` |

Cada execução sorteia CPF, placa, e-mail, código de peça, nome de serviço e
`mechanicId` novos no passo `00`, porque todos esses campos são `@unique` no
banco. Por isso dá para rodar a coleção quantas vezes quiser sem limpar nada.

### A máquina de estados

```
RECEIVED → IN_DIAGNOSIS → AWAITING_APPROVAL → AWAITING_PARTS → IN_PROGRESS → COMPLETED → DELIVERED
                                                                                  ↘ AWAITING_PAYMENT ↗
```

Três transições não têm endpoint próprio — quem move a OS é o efeito colateral
de outra ação:

- `AWAITING_APPROVAL` ← gerar o orçamento (`09`);
- `AWAITING_PARTS` ← aceitar o orçamento (`11`);
- `IN_PROGRESS` ← despachar as peças (`12`).

`AWAITING_PAYMENT` (cobrança em aberto) é onde a OS fica quando o cliente
abandona o checkout do Stripe. Não há endpoint direto: quem leva a OS para lá é
o `GET /payment/cancel`. A única saída dele é a entrega, depois que o pagamento
entrar.

Chamar um passo fora de ordem devolve `400`. `CANCELLED` e `DELIVERED` são
terminais.

## Pagamento (Stripe)

O passo `14` cria a cobrança e uma Checkout Session. A resposta traz o
`paymentLink`, e a coleção guarda o `gatewayTransactionId` em
`{{checkoutSessionId}}` — é por ele que `/payment/success` identifica a cobrança.
O passo `15` só passa com a cobrança em `PAID` — caso contrário, `409`.

Uma cobrança vira `PAID` por um caminho só: o webhook `POST
/billings/stripe/webhook`. Ele valida a assinatura do Stripe sobre o corpo cru,
então **não dá para simulá-lo pelo Postman** — o request na pasta *Cobranças*
está lá para documentar o contrato e responde `400` se enviado.

Para pagar de verdade no ambiente local, escolha um dos dois caminhos:

**Webhook (destrava o passo 15).** Com o [Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
stripe listen --forward-to localhost:3000/api/v1/billings/stripe/webhook
stripe trigger checkout.session.completed
```

**Checkout real (exercita o retorno).** Abra o `paymentLink` da cobrança do passo
`14` no navegador, pague com o cartão de teste `4242 4242 4242 4242` (data
futura, qualquer CVC e CEP) e rode `GET /payment/success` na pasta *Retorno do
checkout*. Um `stripe trigger` **não** substitui isso: ele cria outra sessão, que
não pertence a nenhuma cobrança, e o retorno responde `404`.

As duas rotas de retorno são públicas — quem chega nelas é o navegador do
cliente, sem token — e nenhuma delas acredita no que a URL diz: ambas releem a
Checkout Session no Stripe antes de mexer em cobrança ou em OS. Por isso `200` em
`/payment/success` não significa "entregue": confira `billingStatus` e
`serviceOrderStatus` no corpo da resposta.

## As pastas de referência

Fora do roteiro, cada pasta agrupa o resto dos endpoints do módulo. Os requests
já vêm com corpo de exemplo e uma descrição com as regras que costumam derrubar
a chamada — leia a descrição do request antes de disparar.

| Pasta | Cobre |
|---|---|
| Auth | Renovação e revogação de tokens |
| Clientes | CRUD; `document` não é atualizável |
| Veículos | CRUD e filtro por cliente; `plate` e `clientId` não mudam depois do cadastro |
| Serviços (catálogo) | CRUD do catálogo; `name` é `@unique` |
| Peças e estoque | CRUD, consulta de saldo e saída manual com chave de idempotência |
| Ordens de serviço | Consultas, acompanhamento por cliente, cancelamento e a métrica de tempo médio |
| Orçamentos | Versões, itens, total e recusa |
| Cobranças | Consulta, expiração, renovação de link com multa e juros, e o contrato do webhook |
| Pedidos de compra | Pedido manual, pedido por falta de estoque, itens e o ciclo compra → entrega |
| Notificações | Consulta e reenvio de falhas (somente ADMIN) |
| Retorno do checkout (Stripe) | `GET /payment/success` e `GET /payment/cancel` |

## Rodar pelo terminal

Com o [Newman](https://github.com/postmanlabs/newman):

```bash
npx newman run "postman/Oficina FIAP — Fluxo E2E.postman_collection.json" \
  --folder "00 · Health check" \
  --env-var email=admin@example.com \
  --env-var password=sua-senha
```

Para rodar o fluxo inteiro, exporte um environment do Postman com `email` e
`password` e passe-o em `-e`. Sem `--folder`, o Newman executa também as pastas
de referência, que não foram feitas para rodar em sequência.

## Quando algo falha

| Sintoma | Causa provável |
|---|---|
| Passo `01` devolve `400` ou `401` | `email` e `password` não foram definidos, ou não batem com o `.env` |
| `409` no passo `02` | A rodada não passou pelo `00`, que é quem sorteia CPF e e-mail novos |
| `409` no passo `08` | O mecânico já tem OS aberta — o `00` gera um `mechanicId` novo a cada rodada |
| `409` ao gerar orçamento | Já existe uma versão em `WAITING_APPROVAL`; aceite ou recuse antes de gerar outra |
| Passo `12` com `dispatched: false` | Faltou peça em estoque e um pedido de compra foi aberto — veja abaixo |
| `409` no passo `15` | A cobrança ainda não está `PAID`; rode o Stripe CLI |
| `400` num passo do meio | A OS não está no estado que aquele endpoint exige |
| `403` em `/notifications` | A rota é exclusiva de ADMIN, diferente do resto da API |

Quando o despacho do passo `12` não encontra saldo, a API abre sozinha um pedido
de compra e a OS fica presa em `AWAITING_PARTS`. Para destravar, use a pasta
*Pedidos de compra*: `register-purchase` e depois `deliver` — que devolve as
peças ao estoque — e então chame o passo `12` de novo.

## Documentação relacionada

- [guia-tecnico.md](guia-tecnico.md) — configuração, autenticação, e-mail, pagamentos e arquitetura.
- [linguagem-ubiqua.md](linguagem-ubiqua.md) — o significado de negócio de cada termo que aparece aqui.
- Swagger em `http://localhost:3000/api/v1/docs` — o contrato campo a campo.
