# Guia Tecnico

Material complementar ao README, organizado para migracao para a Wiki do projeto.

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
PAYMENT_SUCCESS_URL=http://localhost:3000/payment/success
PAYMENT_CANCEL_URL=http://localhost:3000/payment/cancel
```

As URLs de sucesso e cancelamento sao rotas do cliente, nao endpoints desta API. Para testar um pagamento aprovado no Stripe Checkout, use o cartao `4242 4242 4242 4242`, data futura, qualquer CVC e CEP.

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

O projeto e um monolito NestJS organizado por modulos de dominio. Cada modulo segue a separacao:

| Diretorio        | Responsabilidade                            |
| ---------------- | ------------------------------------------- |
| `controllers/`   | Rotas HTTP e DTOs                           |
| `services/`      | Casos de uso e orquestracao                 |
| `repositories/`  | Persistencia com Prisma                     |
| `entities/`      | Regras e invariantes de dominio             |
| `value-objects/` | Valores com regras proprias                 |
| `mappers/`       | Conversao entre dominio, persistencia e API |
| `dto/`           | Validacao e contrato Swagger                |

O dominio contempla clientes, veiculos, ordens de servico, orcamentos e estoque. O fluxo previsto da ordem de servico e: `Recebida` -> `Em diagnostico` -> `Aguardando aprovacao` -> `Em execucao` -> `Finalizada` -> `Entregue`.

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
