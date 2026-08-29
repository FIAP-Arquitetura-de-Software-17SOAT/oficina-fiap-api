# Frontend Oficina FIAP — Design

## Contexto

Backend (`oficina-fiap-api`, NestJS + Prisma) já cobre o ciclo completo do diagrama DDD anexado: Cliente, Veículo, Ordem de Serviço (OS), Orçamento, Estoque/Peças, Pedido de Compra, Catálogo de Serviços, Faturamento/Cobrança, Notificações.

Este spec cria um novo repositório frontend em `C:/oficina-fiap-api-frontend`: React + Vite + TypeScript, SPA que consome a API REST em `http://localhost:3000/api/v1`.

Fora de escopo: mudanças de schema/regra de negócio no backend (exceto CORS, ver Decisões). Não há epic de decomposição — é um único produto (SPA de back-office), construído em uma fase (full flow), não em fases separadas.

## Decisões

- **Escopo**: full flow — todos os módulos do diagrama em um único build (não faseado).
- **CORS**: backend não tem CORS configurado (`src/setup-app.ts`). Adicionar `app.enableCors({ origin: <frontend dev origin>, credentials: true })`. Pequena mudança no backend, parte deste trabalho.
- **UI**: MUI (Material UI) + `@mui/x-data-grid` para tabelas de listagem.
- **Stack**: Vite + React 18 + TypeScript; `react-router-dom` v6 (rotas); `@tanstack/react-query` (estado de servidor/cache); `react-hook-form` + `zod` (formulários/validação, espelhando os DTOs do backend); `axios` (HTTP client).
- **Auth**: só existe login ADMIN/EMPLOYEE via JWT (`POST /auth/login`). Não há login de cliente/mecânico/estoquista no backend — os atores do diagrama (AT, MECANICO, ESTOQUISTA) são todos operados por um único usuário staff autenticado. `AuthContext` guarda access token em memória + refresh token em `localStorage` (rotacionado a cada refresh). Role (`ADMIN`/`EMPLOYEE`) do JWT controla visibilidade de nav (Notificações = ADMIN only).
- **Refresh flow**: interceptor axios pega 401 → chama `/auth/refresh` → repete request original; falha no refresh → logout e redireciona para `/login`.
- **Navegação**: Ordem de Serviço é o hub — página de detalhe da OS reúne, em abas, todo o ciclo (status/timeline + ações assign/complete/cancel + Orçamento aninhado + resultado de dispatch de Peças + Faturamento/cobrança), já que várias transições de status da OS não têm rota própria e só acontecem como efeito colateral de outros endpoints (orçamento aceito, dispatch de peças, pagamento confirmado). Demais módulos (Clientes, Veículos, Peças, Serviços, Pedidos de Compra, Notificações) são CRUD padrão lista+formulário.
- **Transições de status na UI**: botões de ação habilitados/desabilitados no cliente espelhando `ALLOWED_TRANSITIONS` do backend (`service-order.entity.ts`), só para UX — a validação real continua no backend.
- **Erros**: exceções de domínio (filtro global do Nest) e erros de validação (400 do `ValidationPipe`) normalizados pelo interceptor axios em toast/snackbar; erros de validação de formulário mapeados para campos via zod onde possível.
- **Testes**: Vitest + React Testing Library (componentes/hooks) + MSW (mock de API) para fluxos-chave (login, criar OS, aceitar orçamento). Sem e2e (Playwright) nesta fase.

## Estrutura de módulos (paridade com backend)

Cada módulo do backend vira uma pasta de feature no frontend (`src/features/<modulo>/`) com: `api.ts` (chamadas axios), `hooks.ts` (React Query hooks), `pages/` (list/detail/form), `types.ts` (espelha DTOs de response).

| Feature frontend | Endpoints backend consumidos |
|---|---|
| `auth` | `POST /auth/login`, `/refresh`, `/logout` |
| `clients` | CRUD `/clients` |
| `vehicles` | CRUD `/vehicles` (filtro `?clientId=`) |
| `service-orders` | `POST /service-orders`, `GET` list/detail, `/metrics/average-execution-time`, `/clients/:clientId`, `PATCH /:id/assign|complete|cancel` |
| `budgets` | CRUD itens, `/send`, `/accept`, `/refuse`, `/total`, `GET /service-orders/:id` |
| `parts` (estoque) | CRUD `/parts`, `/movements/in|out`, `/service-orders/:id/dispatch` |
| `purchase-orders` | CRUD, `/shortages`, `/register-purchase`, `/deliver` |
| `services` (catálogo) | CRUD `/services` |
| `billing` | `POST /billings`, list/detail, `/expire`, `/renew-payment-link`, `/deliver-service-order` |
| `notifications` | `GET /notifications`, `/retry` (ADMIN only) |

## Rotas (react-router)

```
/login
/                          → Dashboard (métricas: tempo médio de execução, contadores por status)
/clientes                  → lista + form
/clientes/:id
/veiculos                  → lista + form
/ordens-servico            → lista (filtro por status)
/ordens-servico/:id        → hub: tabs [Detalhes, Orçamento, Peças, Faturamento]
/pecas                     → lista + form + movimentações
/pedidos-compra            → lista + form
/servicos                  → catálogo, lista + form
/faturamento               → lista de cobranças
/notificacoes              → ADMIN only
```

## Autoria (design doc)

Baseado na imagem DDD fornecida pelo usuário (fluxo Cliente → Veículo → Ordem de Serviço → Orçamento → Estoque/Pedido → Pagamento) e no código atual do backend (relatório de exploração em `src/modules/*`).
