# Oficina FIAP API

API REST para o Sistema Integrado de Atendimento e Execucao de Servicos de uma oficina mecanica. Projeto academico do Tech Challenge da FIAP, evoluido na Fase 2 com Clean Architecture e orquestracao Kubernetes.

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

3. Inicie a aplicacao em um dos modos abaixo.

O Docker cria o banco, aplica as migrations, cria o administrador inicial e inicia a API automaticamente.

### Modo desenvolvimento

```bash
npm run docker:dev
```

Aplica o `docker-compose.dev.yml` por cima do `docker-compose.yml`: a API roda
com `NODE_ENV=development`, o codigo e montado no container e cada alteracao em
`src/` reinicia a aplicacao. O debugger do Node fica na porta `9229`
(configuravel com `DEBUG_PORT`).

| Tarefa | Comando |
| --- | --- |
| Criar migration | `npm run docker:migrate -- --name <nome>` (com a API em execucao) |
| Dados demonstrativos | `npm run docker:demo` |
| Comando avulso no container | `docker compose -f docker-compose.yml -f docker-compose.dev.yml exec app <comando>` |
| Parar tudo | `npm run docker:down` |

Depois de alterar `package.json` ou `prisma/schema.prisma`, rode
`npm run docker:dev` novamente: o `-V` recria os volumes de `node_modules` e
`generated/`. O container roda com UID `1000`, entao migrations e `dist/`
criados por ele ficam com o usuario do host. No WSL, mantenha o repositorio no
filesystem do Linux (`/home/...`); em `/mnt/c/...` o hot reload nao detecta
alteracoes.

### Modo producao (prod-like)

```bash
npm run docker:prod
```

Equivale a `docker compose up --build` e usa as mesmas imagens do deploy
(`runtime`, `migrator`, `seeder`). Com `NODE_ENV=production`, a API exige
`JWT_ACCESS_SECRET` e `JWT_REFRESH_SECRET` com pelo menos 32 bytes; gere-os com
`openssl rand -base64 48`.

### Testes com Docker

```bash
npm run docker:test
```

Sobe um Postgres descartavel (`db-test`, em memoria e sem porta no host),
aplica as migrations e roda `npm test`, `npm run test:e2e` e
`npm run test:e2e:db`. O banco de desenvolvimento nao e tocado. Para um comando
especifico:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile test run --rm test npm test -- src/architecture.spec.ts
```

Remova o `db-test` com `npm run docker:down`.

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
| `STRIPE_API_BASE_URL` | Nao | Somente testes de carga locais (`test/load`): aponta o SDK do Stripe para o fake. Nao defina no EKS |
| `PAYMENT_SUCCESS_URL` | Sim | URL de retorno apos pagamento |
| `PAYMENT_CANCEL_URL` | Sim | URL de retorno apos cancelamento |
| `PUBLIC_API_URL` | No EKS | URL publica usada nos links de aprovacao de orcamento; padrao local `http://localhost:3000` |
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

## Provisionamento da infraestrutura com Terraform

Os scripts em [`infra/`](infra/README.md) criam na AWS (`us-east-1`) a VPC, o
cluster EKS com `metrics-server` (para o HPA), o banco RDS PostgreSQL 16, os
repositorios ECR das imagens `runtime`, `migrator` e `seeder` e a role OIDC
usada pelo GitHub Actions. O state fica em um bucket S3 criado por
`infra/bootstrap`.

Resumo:

```bash
terraform -chdir=infra/bootstrap init && terraform -chdir=infra/bootstrap apply
terraform -chdir=infra/bootstrap output -raw backend_config > infra/backend.hcl
terraform -chdir=infra init -backend-config=backend.hcl
terraform -chdir=infra apply
$(terraform -chdir=infra output -raw configure_kubectl)
```

Recursos criados, custos, outputs consumidos pelo Kubernetes e pela pipeline e
o procedimento de destroy estao em [infra/README.md](infra/README.md).

## Deploy no Kubernetes

Os manifests em [`k8s/`](k8s/README.md) rodam a API em kind (local) e no EKS:
Deployment com probes e recursos, Service, ConfigMap, modelos de Secret, HPA de
CPU/memoria (2 a 4 replicas) e um Job de banco (migration e admin inicial). O banco
fica fora dos Pods da API: PostgreSQL do Compose no kind e o RDS criado pelo
Terraform no EKS. A estrutura usa Kustomize (embutido no `kubectl`): `k8s/base/`
descreve a API e `k8s/overlays/local` e `k8s/overlays/eks` trocam imagens e valores.

```text
Cliente -> NLB publico (EKS) -> Service -> Pods da API (2 a 4) -> PostgreSQL
                                           ^
                               HPA <- Metrics Server

Deploy: namespace -> Secrets -> Job de banco (migration + admin) -> API
```

Com o cluster kind criado, as imagens carregadas e os Secrets cadastrados
(detalhes em [`k8s/README.md`](k8s/README.md)), o deploy local e:

```bash
kubectl apply -f k8s/namespace.yaml
kubectl -n oficina delete job oficina-db-setup --ignore-not-found
kubectl apply -k k8s/overlays/local/jobs
kubectl -n oficina wait --for=condition=complete job/oficina-db-setup --timeout=300s
kubectl apply -k k8s/overlays/local/app
kubectl -n oficina rollout status deployment/oficina-api
```

Para a AWS, troque `local` por `eks`. Confira o cluster alvo com
`kubectl config current-context` antes de aplicar.

Recursos criados, Secrets, endereco publico, o que o Terraform e o CD precisam
fazer e diagnostico estao em [k8s/README.md](k8s/README.md). Os conceitos
(Deployment, Service, HPA, Kustomize) estao em
[docs/wiki/kubernetes.md](docs/wiki/kubernetes.md).

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

### Testes de carga

A suite k6 em `test/load/` mede a capacidade dos fluxos criticos e verifica
regras de concorrencia (estoque, mecanico, refresh token, decisao do
orcamento, webhook de pagamento). Roda isolada em Docker, com Stripe falso e
Mailpit, sem tocar o banco de desenvolvimento:

```bash
npm run load:up && npm run load:smoke && npm run load:down
```

Cenarios e perfis em [test/load/README.md](test/load/README.md).

## Documentacao complementar

Ambos os documentos estao estruturados para futura publicacao na Wiki do projeto

- [docs/wiki/guia-tecnico.md](docs/wiki/guia-tecnico.md) — configuracao, autenticacao, e-mail, pagamentos, migrations, arquitetura, convencoes de codigo e solucao de problemas.
- [docs/wiki/migracao-clean-architecture.md](docs/wiki/migracao-clean-architecture.md) — a migracao dos modulos para Clean Architecture na Fase 2: a regra de dependencia, o layout de um modulo migrado e a pagina de cada modulo ja migrado.
- [docs/wiki/kubernetes.md](docs/wiki/kubernetes.md) — como o Kubernetes funciona neste projeto: cada recurso (Deployment, Service, ConfigMap, Secret, HPA, Job), labels e selectors, a ordem do deploy, Kustomize e os comandos do dia a dia. O passo a passo de deploy esta em [k8s/README.md](k8s/README.md).
- [docs/wiki/colecao-postman.md](docs/wiki/colecao-postman.md) — a colecao do Postman: como importar, as variaveis que voce precisa preencher, o roteiro de ponta a ponta, o pagamento no Stripe e os erros mais comuns.
- [docs/wiki/linguagem-ubiqua.md](docs/wiki/linguagem-ubiqua.md) — a linguagem ubiqua do dominio: termos canonicos, contextos delimitados, agregados, comandos e eventos, estados, regras de negocio e o mapeamento entre termo de negocio e identificador no codigo.
- [docs/c4-diagrams/](docs/c4-diagrams/) — modelo C4 niveis 1 (contexto) e 2 (containers), em `.drawio`.
