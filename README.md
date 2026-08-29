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
   PAYMENT_SUCCESS_URL=http://localhost:3000/payment/success
   PAYMENT_CANCEL_URL=http://localhost:3000/payment/cancel
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
| Health check | http://localhost:3000/api/v1/health |

Use o Swagger para consultar e testar todos os endpoints.

Para acessar rotas administrativas, autentique-se em `POST /api/v1/auth/login` com o e-mail e a senha definidos em `ADMIN_EMAIL` e `ADMIN_PASSWORD`. Envie o `accessToken` retornado no cabecalho:

```http
Authorization: Bearer <accessToken>
```

## Desenvolvimento sem container

```bash
npm install
docker compose up -d db
npx prisma migrate dev
npx prisma db seed
npm run start:dev
```

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

Os detalhes de configuracao, autenticacao, e-mail, pagamentos, arquitetura e solucao de problemas estao em [docs/wiki/guia-tecnico.md](docs/wiki/guia-tecnico.md), estruturado para futura publicacao na Wiki do projeto.
