# Oficina FIAP API

API REST para o Sistema Integrado de Atendimento e Execucao de Servicos de uma oficina mecanica. Projeto academico do Tech Challenge da FIAP (Fase 1, 15SOAT).

O sistema permite gerenciar clientes, veiculos, ordens de servico, orcamentos, estoque, pagamentos e notificacoes.

## Tecnologias

- Node.js e TypeScript
- NestJS 11
- PostgreSQL 16
- Prisma 7
- Docker e Docker Compose
- Swagger / OpenAPI
- Jest

## Execucao local com Docker

### Pre-requisitos

- Docker e Docker Compose

### Passos

1. Crie o arquivo de configuracao:

   ```bash
   cp .env.sample .env
   ```

2. Preencha no `.env` as variaveis obrigatorias:

   ```env
   POSTGRES_PASSWORD=uma-senha-segura
   JWT_ACCESS_SECRET=um-segredo-aleatorio
   JWT_REFRESH_SECRET=outro-segredo-aleatorio
   ADMIN_EMAIL=admin@example.com
   ADMIN_PASSWORD=uma-senha-com-8-ou-mais-caracteres
   STRIPE_SECRET_KEY=sk_test_xxx
   STRIPE_WEBHOOK_SECRET=whsec_xxx
   PAYMENT_SUCCESS_URL=http://localhost:3000/api/v1/payment/success
   PAYMENT_CANCEL_URL=http://localhost:3000/api/v1/payment/cancel
   MAIL_FROM=admin@example.com
   ```

   Para gerar os segredos JWT, execute duas vezes:

   ```bash
   openssl rand -base64 48
   ```

   Para testes de e-mail, use uma conta do [Ethereal](https://ethereal.email/create) e preencha `SMTP_USER`, `SMTP_PASSWORD` e `MAIL_FROM`.

3. Inicie a aplicacao:

   ```bash
   docker compose up --build
   ```

O Docker cria o banco, aplica as migrations, cria o administrador inicial e inicia a API automaticamente.

## Como usar

| Recurso      | Endereco                            |
| ------------ | ----------------------------------- |
| API          | http://localhost:3000/api/v1        |
| Swagger      | http://localhost:3000/api/v1/docs   |
| Readiness (consulta PostgreSQL) | http://localhost:3000/health |
| Liveness (processo HTTP) | http://localhost:3000/live |

Use o Swagger para consultar e testar todos os endpoints.

Para percorrer o fluxo completo — do login a entrega da ordem de servico —
importe a colecao do Postman em `postman/`. As instrucoes estao em
[docs/wiki/colecao-postman.md](docs/wiki/colecao-postman.md).

As rotas antigas `/api/v1/health` e `/api/v1/live` tambem estao disponiveis.
O readiness retorna HTTP 503 quando a consulta `SELECT 1` falha. O liveness
responde sem depender do banco. Ao receber `SIGTERM`, o Nest fecha a aplicacao
e o `PrismaService` desconecta o cliente.

## Contrato de ambiente para Kubernetes e Terraform

As variaveis abaixo sao lidas pela API em execucao. Configure segredos no
gerenciador de segredos do cluster, sem grava-los na imagem.

| Variavel | Obrigatoria | Uso / valor padrao |
| --- | --- | --- |
| `DATABASE_URL` | Sim | URL PostgreSQL usada pelo Prisma e pelo migrator |
| `PORT` | Nao | Porta HTTP; padrao `3000` |
| `NODE_ENV` | Nao | Use `production` no EKS; habilita validacao forte dos segredos JWT |
| `LOG_LEVEL` | Nao | Nivel Pino; padrao `info` |
| `JWT_ACCESS_SECRET` | Sim | Segredo JWT distinto do refresh; em producao, minimo de 32 bytes UTF-8 |
| `JWT_ACCESS_TTL` | Sim | Duracao do access token, por exemplo `15m` |
| `JWT_REFRESH_SECRET` | Sim | Segredo JWT distinto do access; em producao, minimo de 32 bytes UTF-8 |
| `JWT_REFRESH_TTL` | Sim | Duracao do refresh token, por exemplo `7d` |
| `STRIPE_SECRET_KEY` | Sim | Chave `sk_test_...`; a implementacao atual recusa chaves live |
| `STRIPE_WEBHOOK_SECRET` | Sim | Segredo para validar webhooks do Stripe |
| `PAYMENT_SUCCESS_URL` | Sim | URL de retorno apos pagamento |
| `PAYMENT_CANCEL_URL` | Sim | URL de retorno apos cancelamento |
| `SMTP_HOST` | Para envio de e-mail | Host SMTP |
| `SMTP_PORT` | Para envio de e-mail | Porta SMTP valida, por exemplo `587` |
| `SMTP_SECURE` | Para envio de e-mail | `true` ou `false` |
| `SMTP_USER` e `SMTP_PASSWORD` | Nao | Devem ser informados juntos quando o servidor exige autenticacao |
| `MAIL_FROM` | Para envio de e-mail | Remetente com endereco de e-mail valido |
| `STOCK_NOTIFICATION_EMAIL` | Nao | Destinatario de notificacoes de estoque; sem valor, nao envia |

`POSTGRES_DB`, `POSTGRES_PASSWORD` e `POSTGRES_PORT` pertencem apenas ao
Compose local. O Job de seed le `DATABASE_URL`, `ADMIN_EMAIL` e
`ADMIN_PASSWORD`; os dois ultimos nao sao necessarios no Pod da API.
`ADMIN_EMAIL` deve ser um endereco valido. `ADMIN_PASSWORD` deve ter de 8 a
72 caracteres e no maximo 72 bytes UTF-8. O target `seeder` define
`PRISMA_CLIENT_MODULE` internamente.

O Dockerfile fixa Node.js 24.13.0. Gere as imagens da mesma revisao de
codigo e identifique-as com o mesmo SHA do commit:

```bash
docker build --target runtime -t oficina-api:${GIT_SHA} .
docker build --target migrator -t oficina-migrator:${GIT_SHA} .
docker build --target seeder -t oficina-seeder:${GIT_SHA} .
```

Em um banco novo, execute o `migrator` como Job e, depois, o `seeder` como
Job. O seed cria o administrador inicial se ainda nao existir; configure
`DATABASE_URL`, `ADMIN_EMAIL` e `ADMIN_PASSWORD` nesse Job. Depois,
disponibilize os Pods da API. Use `/health` como readiness probe e `/live`
como liveness probe na porta `3000`. Os tres targets executam com UID/GID
`1000` (`node`); configure o `securityContext` do Kubernetes com esse usuario
e um periodo de encerramento da API de pelo menos 30 segundos para o
`SIGTERM` concluir.

Para acessar rotas administrativas, autentique-se em `POST /api/v1/auth/login` com o e-mail e a senha definidos em `ADMIN_EMAIL` e `ADMIN_PASSWORD`. Envie o `accessToken` retornado no cabecalho:

```http
Authorization: Bearer <accessToken>
```

## Desenvolvimento sem container

```bash
npm install
docker compose up -d db
npx prisma migrate dev
npx prisma db seed -- admin
npm run seed:demo
npm run start:dev
```

`npm run seed:demo` e opcional e inclui dados demonstrativos para consulta no
Swagger: clientes, veiculos, catalogo de servicos, pecas, ordens de servico em
todos os estados, orcamentos, pedido de compra e cobrancas. O comando e
idempotente, nao remove ou altera dados existentes e recusa execucao com
`NODE_ENV=production`. Ele nao e executado pelo Docker Compose.

Nesse modo, defina `DATABASE_URL` no `.env` com a mesma senha de `POSTGRES_PASSWORD`, por exemplo:

```env
DATABASE_URL=postgres://postgres:SENHA@localhost:5432/oficina_fiap
```

## Testes

```bash
npm test
npm run test:cov
npm run test:e2e
```

## Documentacao complementar

Ambos os documentos estao estruturados para futura publicacao na Wiki do projeto.

- [docs/wiki/guia-tecnico.md](docs/wiki/guia-tecnico.md) — configuracao, autenticacao, e-mail, pagamentos, migrations, arquitetura, convencoes de codigo e solucao de problemas.
- [docs/wiki/migracao-clean-architecture.md](docs/wiki/migracao-clean-architecture.md) — a migracao dos modulos para Clean Architecture na Fase 2: a regra de dependencia, o layout de um modulo migrado e a pagina de cada modulo ja migrado.
- [docs/wiki/colecao-postman.md](docs/wiki/colecao-postman.md) — a colecao do Postman: como importar, as variaveis que voce precisa preencher, o roteiro de ponta a ponta, o pagamento no Stripe e os erros mais comuns.
- [docs/wiki/linguagem-ubiqua.md](docs/wiki/linguagem-ubiqua.md) — a linguagem ubiqua do dominio: termos canonicos, contextos delimitados, agregados, comandos e eventos, estados, regras de negocio e o mapeamento entre termo de negocio e identificador no codigo.
- [docs/c4-diagrams/](docs/c4-diagrams/) — modelo C4 niveis 1 (contexto) e 2 (containers), em `.drawio`.
