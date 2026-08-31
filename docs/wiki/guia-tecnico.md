# Guia Tecnico

Material complementar ao README, organizado para migracao para a Wiki do projeto.

O vocabulario de negocio fica em documento proprio: [linguagem-ubiqua.md](linguagem-ubiqua.md).

## Configuracao

O projeto reconhece as seguintes variaveis no `.env`. O Compose exige as indicadas diretamente no arquivo `docker-compose.yml`; `SMTP_USER`, `SMTP_PASSWORD` e `STOCK_NOTIFICATION_EMAIL` sao opcionais.

| Variavel                   | Finalidade                                         |
| -------------------------- | -------------------------------------------------- |
| `POSTGRES_PASSWORD`        | Senha do PostgreSQL                                |
| `JWT_ACCESS_SECRET`        | Assinatura dos access tokens                       |
| `JWT_REFRESH_SECRET`       | Assinatura dos refresh tokens                      |
| `ADMIN_EMAIL`              | E-mail do administrador inicial                    |
| `ADMIN_PASSWORD`           | Senha do administrador inicial                     |
| `STRIPE_SECRET_KEY`        | Chave de teste Stripe                              |
| `STRIPE_WEBHOOK_SECRET`    | Segredo do webhook Stripe                          |
| `PAYMENT_SUCCESS_URL`      | URL exibida apos pagamento bem-sucedido            |
| `PAYMENT_CANCEL_URL`       | URL exibida apos cancelamento                      |
| `SMTP_HOST`                | Servidor SMTP                                      |
| `SMTP_PORT`                | Porta SMTP                                         |
| `SMTP_SECURE`              | `true` para TLS implicito; caso contrario, `false` |
| `SMTP_USER`                | Usuario SMTP, quando utilizado                     |
| `SMTP_PASSWORD`            | Senha SMTP, quando utilizado                       |
| `MAIL_FROM`                | Remetente dos e-mails                              |
| `STOCK_NOTIFICATION_EMAIL` | Destinatario dos avisos de estoque                 |

`JWT_ACCESS_SECRET` e `JWT_REFRESH_SECRET` devem ser valores aleatorios e distintos. Os TTLs podem ser ajustados em `JWT_ACCESS_TTL` (padrao `15m`) e `JWT_REFRESH_TTL` (padrao `7d`).

O Compose executa os servicos nesta ordem: banco de dados, migrations, seed e API. O seed e idempotente: cria o administrador apenas quando ele ainda nao existe.

## Autenticacao

### Login

`POST /api/v1/auth/login`

```json
{
  "email": "admin@example.com",
  "password": "senha-configurada-no-seed"
}
```

A resposta contem `accessToken` e `refreshToken`. Use o access token nas rotas protegidas:

```http
Authorization: Bearer <accessToken>
```

### Renovacao e logout

`POST /api/v1/auth/refresh` recebe:

```json
{ "refreshToken": "eyJ..." }
```

Cada renovacao gera um novo par de tokens e revoga o refresh token usado. `POST /api/v1/auth/logout` recebe o mesmo payload e encerra a sessao. Tokens invalidos, expirados, revogados ou reutilizados retornam `401`.

## E-mail

As notificacoes de orcamento, pagamento e estoque sao registradas antes da tentativa de entrega. Falhas nao desfazem a operacao de negocio: a notificacao fica com status `FAILED` e pode ser reprocessada por um administrador.

Para testar localmente, crie uma conta no [Ethereal](https://ethereal.email/create) e use:

```env
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=usuario-do-ethereal
SMTP_PASSWORD=senha-do-ethereal
MAIL_FROM=usuario-do-ethereal@ethereal.email
```

Para reprocessar uma entrega com falha:

1. Consulte `GET /api/v1/notifications?status=FAILED`.
2. Corrija o destinatario, conteudo ou configuracao SMTP.
3. Execute `POST /api/v1/notifications/{id}/retry`.
4. Confirme que o status mudou para `SENT`.

As rotas exigem um access token de administrador.

## Pagamentos

O projeto utiliza Stripe Checkout Sessions. Use somente chaves de teste no desenvolvimento local.

```env
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
PAYMENT_SUCCESS_URL=http://localhost:3000/api/v1/payment/success
PAYMENT_CANCEL_URL=http://localhost:3000/api/v1/payment/cancel
```

As duas URLs sao para onde o Stripe redireciona o navegador do cliente ao fim do checkout, e a propria API as atende em `GET /payment/success` e `GET /payment/cancel`. As rotas sao publicas, porque quem chega nelas nao tem token, e nenhuma delas confia no que a URL diz: as duas releem a Checkout Session no gateway antes de alterar cobranca ou ordem de servico. O sucesso quita a cobranca e leva a OS para `DELIVERED`; o cancelamento deixa a OS em `AWAITING_PAYMENT`, com a cobranca em aberto.

Uma cobranca so vira `PAID` pelo webhook `POST /billings/stripe/webhook`, que valida a assinatura do Stripe sobre o corpo cru da requisicao.

Para testar um pagamento aprovado no Stripe Checkout, use o cartao `4242 4242 4242 4242`, data futura, qualquer CVC e CEP. O roteiro completo, com os comandos do Stripe CLI, esta em [colecao-postman.md](colecao-postman.md).

## Banco de dados e migrations

Para criar uma migration:

```bash
npx prisma migrate dev --name descricao_da_mudanca
```

Os arquivos em `prisma/migrations/` devem ser versionados. Em ambientes Docker, as migrations sao aplicadas automaticamente ao iniciar os servicos.

Se o banco local foi inicializado com dados incorretos ou a senha foi alterada depois da criacao do volume, recrie-o:

```bash
docker compose down -v
docker compose up --build
```

Esse comando apaga os dados locais do PostgreSQL.

## Arquitetura

Os diagramas C4 de contexto e de containers estao em [../c4-diagrams/](../c4-diagrams/).

O projeto e um monolito NestJS organizado por modulos de dominio. Cada modulo segue a separacao:

| Diretorio        | Responsabilidade                            |
| ---------------- | ------------------------------------------- |
| `controllers/`   | Rotas HTTP e DTOs                           |
| `services/`      | Casos de uso e orquestracao                 |
| `repositories/`  | Persistencia com Prisma                     |
| `entities/`      | Regras e invariantes de dominio             |
| `value-objects/` | Valores com regras proprias (`*.vo.ts`)     |
| `enums/`         | Estados e tipos do dominio (`*.enum.ts`)    |
| `mappers/`       | Conversao entre dominio, persistencia e API |
| `dto/`           | Validacao e contrato Swagger                |

Sao sete os agregados de negocio implementados: **Cliente**, **Veiculo**, **Ordem de Servico**, **Orcamento**, **Peca**, **Pedido de Compra** e **Cobranca**. Autenticacao e notificacao sao modulos transversais.

> **Estoque e o contexto, nao o agregado.** O agregado operacional e a **Peca** (`Part`) e a **Movimentacao de estoque** (`StockMovement`) e o registro da entrada ou da saida. Por isso o recurso HTTP e `/api/v1/parts`, enquanto a pasta do modulo continua `src/modules/stock`: ela representa o contexto Estoque e Compras, que abriga os dois.

O fluxo da ordem de servico e: `Recebida` -> `Em diagnostico` -> `Aguardando aprovacao` -> `Aguardando pecas` -> `Em execucao` -> `Finalizada` -> `Entregue`. De qualquer estado nao terminal tambem se chega a `Cancelada`. Um orcamento so de servicos pula `Aguardando pecas`, porque nao ha o que baixar do estoque.

**Recusar orcamento nao encerra a OS.** A OS fica em `Aguardando aprovacao` e o mecanico gera quantas versoes de orcamento precisar para a mesma OS. Desistir do atendimento e decisao manual, via `PATCH /api/v1/service-orders/{id}/cancel`, que exige motivo.

## Convencoes de codigo

O vocabulario do projeto e o mapeamento entre termo de negocio e identificador no codigo estao em [linguagem-ubiqua.md](linguagem-ubiqua.md), que e a fonte da verdade. As regras que mais aparecem em revisao:

- **Rotas no plural**, sempre: `/clients`, `/vehicles`, `/service-orders`, `/parts`, `/budgets`, `/billings`, `/services`, `/purchase-orders`, `/notifications`. O `@ApiTags` do controller repete o nome da rota.
- **Identificador em ingles, mensagem de negocio em portugues** — `DomainException`, excecao HTTP e texto de Swagger. Nunca os dois idiomas no mesmo nome.
- **Dinheiro e `Money`** dentro do dominio, centavos inteiros no banco (`*Cents`) e decimal no contrato HTTP. Um DTO com `unitPrice: number` esta correto: e a fronteira. O que nao pode e o agregado guardar `number`.
- **Quantidade e `Quantity`** (VO compartilhado): `create` para saldo, que pode ser zero, e `positive` para movimento, que nao pode.
- **Sempre mapeie entidade para DTO no controller.** Devolver a entidade direto serializa o VO como `{ "value": "..." }` e quebra o contrato do Swagger.
- **Um conceito, uma classe.** VO usado por mais de um modulo sobe para `src/shared/domain/value-objects/` em vez de ser duplicado.
- **A entidade protege as proprias invariantes** e lanca `DomainException` — nunca `Error` generico, que viraria 500.
- **Value Object onde ha regra propria** (documento, placa, dinheiro, quantidade). Nome e telefone continuam `string`; VO em tudo e overengineering.
- **Nao crie um `PrismaService` por modulo.** O `PrismaModule` e `@Global`; basta injetar `PrismaService` no repositorio. Um por modulo significaria um pool de conexoes por modulo.
- **Documente toda rota** com `@ApiOperation` e as respostas de erro.

### Nomenclatura

- **Um termo, um identificador — inclusive o tipo.** Nao basta o campo ter o nome certo; o tipo dele tambem. `getDocument(): CpfCnpj` dava dois nomes ao mesmo conceito na mesma assinatura: hoje e `getDocument(): Document`.
- **Nao misturar os dois idiomas num mesmo identificador.** `getPecaId` numa classe `PurchaseOrderItem` e o caso a evitar; o correto e `getPartId`. Vale tambem para metodo: `isPessoaJuridica` virou `isLegalEntity`.
- **Cliente e `Client`.** `Customer` nao e sinonimo aceito, nem em metodo nem em exemplo de Swagger.
- **Nomeie pelo conceito, nao pelo formato.** `Document` aceita CPF e CNPJ; chamar a classe de `CpfCnpj` nomearia a validacao em vez do conceito.
- Ao escrever texto: **Ordem de Servico** na primeira ocorrencia e **OS** nas seguintes; evitar "pedido" sozinho, que confunde OS com Pedido de Compra. Evento em participio (`Orcamento gerado`), comando em infinitivo (`Gerar orcamento`).

## Decisoes de modelagem

Onde o modelo conceitual do Event Storming e o codigo nao se sobrepoem, esta e a leitura adotada.

- **Diagnostico nao tem entidade propria.** O desenho traz *Diagnostico* e *ItemOrdemServico* como entidades da OS. No codigo a OS guarda so uma `description`, e os itens ficam em `BudgetItem`. O termo de negocio continua valendo; a modelagem detalhada e evolucao futura.
- **Pagamento vive dentro da Cobranca.** `paymentMethod`, `paidAt` e o identificador da transacao sao campos de `Billing`; as sessoes de checkout ficam em `BillingCheckoutSession`.
- **`StockMovement` nao e entidade rica.** Existe como registro persistido; quem protege o saldo e a `Part`. Cada movimentacao carrega chave de idempotencia.
- **`Budget.serviceOrderId` e referencia externa, sem FK.** Orcamento e OS sao agregados distintos e se ligam por identidade, como a OS faz com o mecanico. Ja a relacao `PurchaseOrderItem` -> `Part` tem FK, porque ambos vivem no contexto Estoque e Compras.
- **Nao ha barramento de eventos.** Os fatos do board sao realizados por chamadas sincronas entre controllers e por notificacoes registradas. Se um barramento for adicionado, reaproveitar os nomes de evento da linguagem ubiqua nos contratos.

## Decisoes pendentes

1. Definir se `Diagnostico` sera entidade propria da OS ou seguira representado pela descricao da OS e pelos itens do orcamento.
2. Definir o tratamento de reparos adicionais numa OS ja em execucao. O codigo permite varias versoes de orcamento, mas a maquina de estados nao contempla `Em execucao` -> `Aguardando pecas`: hoje `Em execucao` so leva a `Finalizada` ou `Cancelada`.
3. Definir se a entrega de um Pedido de Compra deve apenas atualizar o estoque ou tambem disparar nova tentativa de despacho da OS. Hoje so da entrada no estoque, e o despacho precisa ser solicitado de novo.
4. Resolver o Swagger do modulo `service-order`, que segue em ingles por causa do teste `uses ASCII-only Swagger operation metadata for service orders`, enquanto o resto do projeto usa portugues.

## Regras de negocio implementadas

### Cliente

- CPF e CNPJ sao validados e persistidos apenas com digitos.
- E-mail e normalizado para minusculas e nao pode duplicar.
- Telefone exige DDD e e persistido apenas com digitos.
- Documento nao pode ser alterado apos o cadastro.
- Um cliente com veiculos vinculados nao pode ser removido.

### Veiculo

- Aceita placas no formato antigo e Mercosul, normalizadas antes da persistencia.
- O ano deve estar entre 1900 e o proximo ano-calendario.
- Placa e proprietario nao podem ser alterados apos o cadastro.
- O cadastro exige um cliente existente e nao permite placa duplicada.
