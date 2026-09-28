# Modulo Auth

Decimo e ultimo modulo migrado, junto com o subsistema `shared/identity` que ele e o client compartilham. Ninguem depende do auth; ele depende so de `shared/identity` e de `shared/http/auth` (guards e strategy do Passport, que protegem as rotas de todos os modulos e por isso ficam em `shared`). A regra geral esta em [Migracao para Clean Architecture](../migracao-clean-architecture.md).

## Estrutura

```text
src/modules/auth/
  application/
    use-cases/login.use-case.ts
    use-cases/refresh-tokens.use-case.ts
    use-cases/logout.use-case.ts
    services/refresh-token-sessions.ts
    ports/token-issuer.port.ts
    contracts/auth.input.ts
    errors/auth-application.error.ts
  infrastructure/
    jwt/jwt-token-issuer.ts
    jwt/jwt-settings.ts
  presentation/http/
    auth.controller.ts
    dto/auth.dto.ts
  auth.module.ts

src/shared/identity/
  domain/entities/user.entity.ts
  domain/entities/refresh-session.entity.ts
  application/ports/user-repository.port.ts
  application/ports/refresh-session-repository.port.ts
  application/ports/password-hasher.port.ts
  infrastructure/persistence/prisma-user.repository.ts
  infrastructure/persistence/prisma-refresh-session.repository.ts
  infrastructure/security/bcrypt-password-hasher.ts
  http/login-credentials.ts
  identity.module.ts
```

O auth nao tem `domain/`: as entidades `User` e `RefreshSession` sao de identidade e moram em `shared/identity/domain`, porque o modulo `client` tambem cria usuarios (a conta do cliente).

## O que mudou em relacao ao layout legado

| Antes | Depois |
| --- | --- |
| `services/auth.service.ts`: `login`, `refresh`, `logout` mais a leitura da configuracao JWT, injetando `JwtService`, `ConfigService`, `PrismaService` e os repositorios concretos de identidade | tres casos de uso; o que se repetia (emitir o par + sessao, ler um refresh token, conferir que o token e dono da sessao) virou `RefreshTokenSessions` em `application/services/` |
| `readJwtSettings` no mesmo arquivo do service | `infrastructure/jwt/jwt-settings.ts`, usado pelo modulo e pelo `JwtTokenIssuer` |
| `JwtService` chamado direto pelo service, com segredo e TTL escolhidos a cada chamada | `TokenIssuerPort` (`sign(claims)`, `verifyRefresh(token) -> payload \| null`); o adapter escolhe segredo e TTL pelo `type` do claim |
| `refresh` abria um `prisma.$transaction` direto no service para revogar a sessao consumida e gravar a nova | `RefreshSessionRepositoryPort.rotate(consumedJti, revokedAt, replacement) -> boolean`; a transacao e da implementacao Prisma |
| `UnauthorizedException` do Nest no service | `AuthApplicationError` com dois codigos, ambos `UNAUTHORIZED` |
| `shared/identity` plano: `entities/`, `repositories/`, `services/` com classes concretas exportadas | `shared/identity` em camadas; `IdentityModule` exporta so `UserRepositoryPort`, `RefreshSessionRepositoryPort` e `PasswordHasherPort` |
| `PasswordHashService` | `PasswordHasherPort` + `BcryptPasswordHasher` |
| `login-credentials.ts` (decorator de validacao) na raiz de `shared/identity` | `shared/identity/http/`, porque e `class-validator` |

Contratos HTTP, mensagens publicas, claims dos tokens, schema e migrations nao mudaram.

## O colaborador de sessao

`RefreshTokenSessions` concentra tres coisas que login, refresh e logout dividem:

- `issue(user)`: assina access e refresh com `jti` proprios e devolve o par junto com a `RefreshSession`, que guarda so o hash bcrypt do **digest** SHA-256 do refresh token (bcrypt corta em 72 bytes; um JWT passa disso).
- `verify(token)`: assinatura, validade e forma do refresh token. Qualquer falha e o mesmo `INVALID_REFRESH_TOKEN`, sem dizer o que faltou.
- `owns(session, payload, token)`: o token so vale para a sessao que ele mesmo abriu (mesmo `jti`, mesmo usuario, hash bate). Refresh exige alem disso sessao viva; logout aceita sessao ja revogada, porque repetir o logout e inofensivo.

## Portas

| Porta | O que pede | Adapter |
| --- | --- | --- |
| `TokenIssuerPort` | assinar claims; verificar um refresh token | `JwtTokenIssuer` sobre `@nestjs/jwt`, com `readJwtSettings` |
| `UserRepositoryPort` | `findByEmail`, `findById`, `findByClientId`, `create` | `PrismaUserRepository` |
| `RefreshSessionRepositoryPort` | `create`, `findByJti`, `revoke`, `rotate` atomico | `PrismaRefreshSessionRepository` |
| `PasswordHasherPort` | `hash`, `compare` | `BcryptPasswordHasher` |

## Erros

| Codigo | `kind` | Status | Mensagem |
| --- | --- | --- | --- |
| `INVALID_CREDENTIALS` | `UNAUTHORIZED` | 401 | `Invalid credentials` |
| `INVALID_REFRESH_TOKEN` | `UNAUTHORIZED` | 401 | `Invalid refresh token` |

## Quem consome

- `client`: `ClientIdentityAdapter` injeta `UserRepositoryPort` e `PasswordHasherPort` para criar a conta do cliente.
- `shared/http/auth`: `AccessTokenStrategy`, `JwtAuthGuard` e `RolesGuard` continuam registrados pelo `AuthModule` e exportados para o guard global.

Nos testes E2E, `overrideProvider(UserRepositoryPort)` e `overrideProvider(RefreshSessionRepositoryPort)`; o fake de sessao implementa `rotate`, entao o `PrismaService` nao precisa mais de um fake com `$transaction`.

## Limpeza final desta PR

- `src/shared/notifications` apagado: `escapeHtml` foi para `src/shared/infrastructure/html/` e `EmailContent` para `src/shared/infrastructure/email/`. Os templates de e-mail moram nos modulos desde as PRs 7, 8 e 9.
- `ClientModule` deixa de exportar `ClientRepositoryPort`; so `FindClientUseCase`.
- O teste de fronteira varre todos os modulos de `src/modules` (a lista `migrated-modules.ts` deixou de existir) e ganhou a regra das camadas externas: `infrastructure/` e `presentation/` so alcancam outro modulo pelo `domain/` e `application/` dele. `shared/identity/domain` e `shared/identity/application` entram na checagem de `shared`.

## Testes

- Casos de uso: `application/use-cases/auth-use-cases.spec.ts`, com `JwtTokenIssuer` real, hasher falso (rapido e reversivel) e repositorio de sessoes em memoria com `rotate`.
- Infra: `infrastructure/jwt/jwt-settings.spec.ts` (validacao dos segredos e TTLs, antes dentro do spec do service) e `jwt-token-issuer.spec.ts`.
- Identidade: specs dos repositorios Prisma (inclusive a rotacao atomica) e do hasher.
- HTTP: `test/auth.e2e-spec.ts` e `test/customer.e2e-spec.ts`, inalterados no contrato.
