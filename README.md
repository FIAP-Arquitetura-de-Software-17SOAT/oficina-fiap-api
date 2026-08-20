# Oficina FIAP API

Back-end do Sistema Integrado de Atendimento e Execução de Serviços de uma
oficina mecânica — Tech Challenge da Fase 1 (15SOAT).

MVP monolítico em **arquitetura em camadas**, aplicando DDD nos agregados do
domínio.

## Stack

| Camada       | Escolha                                        |
| ------------ | ---------------------------------------------- |
| Runtime      | Node.js LTS + TypeScript                       |
| Framework    | NestJS 11                                      |
| Banco        | PostgreSQL 16                                  |
| ORM          | Prisma 7 (driver adapter `@prisma/adapter-pg`) |
| Documentação | Swagger / OpenAPI                              |
| Logs         | Pino (`nestjs-pino`)                           |
| Testes       | Jest + Supertest                               |

### Por que PostgreSQL

O domínio da oficina é fortemente relacional: uma Ordem de Serviço referencia
cliente, veículo, itens de serviço e itens de peça, e o orçamento é derivado
desses vínculos. Isso pede integridade referencial e transações ACID — baixar o
estoque e mudar o status da OS precisam acontecer atomicamente. Além disso, as
regras de unicidade do negócio (um CPF/CNPJ por cliente, uma placa por veículo)
são expressas diretamente como constraints, e não como validação em código
sujeita a corrida. Um banco documental exigiria replicar esses dados e resolver
consistência na aplicação, sem ganho de escala relevante para um MVP.

## Subindo o projeto

Pré-requisitos: Docker e Docker Compose.

```bash
cp .env.sample .env
docker compose up --build
```

Só isso. O compose orquestra quatro serviços em ordem:

1. **`db`** — Postgres sobe e espera ficar `healthy`
2. **`migrate`** — roda `prisma migrate deploy` e encerra
3. **`seed`** — cria o administrador inicial, se ele ainda não existir
4. **`app`** — só inicia depois que migration e seed terminam com sucesso

O serviço `migrate` roda a **cada `docker compose up`**. Se não houver migration
pendente ele sai imediatamente, então é seguro e ninguém precisa rodar Prisma na
mão.

| Recurso      | URL                                    |
| ------------ | -------------------------------------- |
| API          | http://localhost:3000/api/v1           |
| Swagger UI   | http://localhost:3000/api/v1/docs      |
| OpenAPI JSON | http://localhost:3000/api/v1/docs-json |
| Health check | http://localhost:3000/api/v1/health    |

> A porta do host vem de `PORT` no `.env`. Se você mudar para `8080`, a API
> responde em `http://localhost:8080`.

## Autenticação administrativa

Configure as credenciais e os JWTs no `.env` antes de subir a aplicação:

| Variável             | Finalidade                      | Exemplo local              |
| -------------------- | ------------------------------- | -------------------------- |
| `JWT_ACCESS_SECRET`  | Assina access tokens            | `change-me-access-secret`  |
| `JWT_ACCESS_TTL`     | Validade do access token        | `15m`                      |
| `JWT_REFRESH_SECRET` | Assina refresh tokens           | `change-me-refresh-secret` |
| `JWT_REFRESH_TTL`    | Validade do refresh token       | `7d`                       |
| `ADMIN_EMAIL`        | E-mail do administrador inicial | `admin@example.com`        |
| `ADMIN_PASSWORD`     | Senha do administrador inicial  | `change-me-admin-password` |

Os dois secrets JWT são obrigatórios, devem ser diferentes e, fora do ambiente
local, devem ser valores aleatórios de alta entropia. Os TTLs aceitam durações
JWT inteiras como `15m`, `1h` ou `7d`. A senha deve ter entre 8 e 72 caracteres.

O Docker Compose executa o seed automaticamente. No desenvolvimento local, após
aplicar as migrations, rode:

```bash
npx prisma db seed
```

O seed é idempotente e usa `ADMIN_EMAIL`/`ADMIN_PASSWORD`: ele não altera um
administrador que já exista. Senhas nunca são persistidas em texto puro; apenas
o hash bcrypt é armazenado.

### Endpoints

`POST /api/v1/auth/login` recebe credenciais e retorna o par de tokens:

```json
{
  "email": "admin@example.com",
  "password": "change-me-admin-password"
}
```

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}
```

Use o access token nas rotas protegidas com o header
`Authorization: Bearer <accessToken>`. Access e refresh tokens usam secrets e
tempos de expiração distintos; um refresh token não é aceito como access token.

`POST /api/v1/auth/refresh` recebe:

```json
{ "refreshToken": "eyJ..." }
```

Cada refresh bem-sucedido devolve um novo par e revoga o refresh token consumido
atomicamente. Reutilizar o token antigo é replay e retorna `401`. O banco guarda
somente um hash bcrypt irreversível do digest do refresh token, nunca o token em
texto puro.

`POST /api/v1/auth/logout` recebe o mesmo payload de refresh e responde `204`
após revogar a sessão. Login inválido, refresh inválido/expirado/revogado e
replay retornam `401`.

### Protegendo futuros controllers administrativos

As rotas de cliente existentes continuam públicas. Em futuros controllers
administrativos, aplique autenticação, autorização e documentação Swagger em
conjunto:

```typescript
import { Controller, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Role } from '../generated/prisma/enums';
import { JwtAuthGuard } from './shared/http/auth/jwt-auth.guard';
import { Roles } from './shared/http/auth/roles.decorator';
import { RolesGuard } from './shared/http/auth/roles.guard';

@Controller('admin/example')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@ApiForbiddenResponse({ description: 'Authenticated role is not allowed' })
export class AdminController {}
```

Use `@CurrentUser()` quando o handler precisar do usuário autenticado; o valor
exposto contém apenas `{ id, role }`. Não aplique `@ApiBearerAuth()` em endpoints
públicos.

### Problemas comuns

**`service "migrate" didn't complete successfully: exit 1`** com
`P1010: User was denied access` ou `database "oficina_fiap" does not exist`:

```bash
docker compose down -v && docker compose up -d
```

O `-v` é o que importa — ele apaga o volume do Postgres.

Motivo: `POSTGRES_DB` e `POSTGRES_PASSWORD` só têm efeito na **primeira** criação
do volume. Se o volume já existe, a imagem do Postgres imprime
`Skipping initialization` e ignora as duas variáveis para sempre. Então basta
que uma inicialização tenha sido interrompida no meio (um `Ctrl+C`, um
`docker compose down` durante o primeiro `up`), ou que alguém mude
`POSTGRES_PASSWORD`/`POSTGRES_DB` no `.env` depois do volume já existir, para o
banco ficar num estado que nenhum `up` posterior conserta.

> `docker compose down -v` apaga os dados locais. Como as migrations são
> reaplicadas automaticamente no próximo `up`, isso é seguro em desenvolvimento.

## Desenvolvimento local (fora do container)

```bash
npm install
docker compose up -d db      # só o banco
npx prisma migrate dev       # aplica migrations e gera o Prisma Client
npm run start:dev
```

O `DATABASE_URL` do `.env.sample` já aponta para `localhost:5432`, que é o
endereço correto quando a app roda no host.

### Criando uma migration

```bash
npx prisma migrate dev --name descricao_da_mudanca
```

O arquivo gerado em `prisma/migrations/` **deve ser commitado** — é ele que o
serviço `migrate` aplica no ambiente de todo mundo.

## Testes

```bash
npm test          # unitários
npm run test:cov  # unitários + cobertura (falha abaixo de 80%)
npm run test:e2e  # integração (HTTP completo, sem precisar de banco)
```

Os testes de integração substituem o repositório por uma implementação em
memória e sobem a aplicação com **a mesma configuração do `main.ts`** (prefixo,
`ValidationPipe`, filtro de exceção de domínio), via `configureApp()`. Rodam em
CI sem infraestrutura.

`test/swagger.e2e-spec.ts` valida o contrato OpenAPI: quebra se alguém adicionar
uma rota sem documentar ou mudar o response sem atualizar o DTO.

O `coverageThreshold` está em 80% (branches, funções, linhas e statements),
conforme exigido pelo Tech Challenge.

## Estrutura

```
src/
├── modules/                  # um módulo por agregado do domínio
│   └── client/
│       ├── controllers/      # borda HTTP, fala em DTO
│       ├── services/         # orquestra o caso de uso
│       ├── repositories/     # acesso a dados, traduz entidade <-> Prisma
│       ├── entities/         # entidade rica, dona das invariantes
│       ├── value-objects/    # CpfCnpj, Email
│       ├── mappers/          # entidade -> DTO de resposta
│       └── dto/              # contrato de entrada/saída + Swagger
└── shared/
    ├── database/             # PrismaModule global (uma conexão para todos)
    ├── domain/               # DomainException
    └── http/                 # guards JWT/RBAC e filtros de erro
```

### Convenções para novos módulos

Ao criar `vehicle`, `service-order`, `stock` etc., siga o módulo `client`:

- **Não crie um `PrismaService` por módulo.** O `PrismaModule` é `@Global`;
  basta injetar `PrismaService` no repositório. Um por módulo significaria um
  pool de conexões por módulo.
- **A entidade protege as próprias invariantes** e lança `DomainException` —
  nunca `Error` genérico, que viraria 500.
- **Value Object onde há regra própria** (CPF/CNPJ, placa, dinheiro). Nome e
  telefone continuam `string`; VO em tudo é overengineering.
- **Sempre mapeie entidade → DTO no controller.** Devolver a entidade direto
  serializa o VO como `{ "value": "..." }` e quebra o contrato do Swagger.
- **Documente toda rota** com `@ApiOperation` e as respostas de erro.

## Domínio

Modelagem via Event Storming, com os agregados: **Cliente**, **Veículo**,
**Ordem de Serviço**, **Orçamento** e **Estoque**.

Status da Ordem de Serviço: `Recebida` → `Em diagnóstico` →
`Aguardando aprovação` → `Em execução` → `Finalizada` → `Entregue`.

### Cliente (implementado)

| Verbo  | Rota                 | Descrição    |
| ------ | -------------------- | ------------ |
| POST   | `/api/v1/client`     | Cadastra     |
| GET    | `/api/v1/client`     | Lista        |
| GET    | `/api/v1/client/:id` | Busca por id |
| PATCH  | `/api/v1/client/:id` | Atualiza     |
| DELETE | `/api/v1/client/:id` | Remove       |

Regras aplicadas:

- CPF **e** CNPJ com validação de dígito verificador; aceita com ou sem
  máscara e persiste apenas dígitos
- E-mail normalizado para minúsculas (a coluna é única)
- Telefone exige DDD, aceita 8 ou 9 dígitos, persiste apenas dígitos
- Documento é **imutável** após o cadastro — não existe no `UpdateClientDto`
- Documento e e-mail duplicados retornam `409`; dado inválido retorna `400`
