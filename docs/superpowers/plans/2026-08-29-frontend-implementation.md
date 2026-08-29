# Frontend Oficina FIAP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a React SPA at `C:/oficina-fiap-api-frontend` that fully drives the Oficina FIAP workflow (Cliente, Veículo, Ordem de Serviço, Orçamento, Estoque, Pedido de Compra, Serviços, Faturamento, Notificações) against the existing NestJS API.

**Architecture:** Vite + React 18 + TypeScript SPA. `react-router-dom` for routing, `@tanstack/react-query` for server state, `react-hook-form` + `zod` for forms, `axios` for HTTP, MUI + `@mui/x-data-grid` for UI. Ordem de Serviço detail page is the hub: a tabbed view aggregating status actions, Orçamento, Peças dispatch, and Faturamento, since those transitions have no direct OS endpoint and only happen as side effects of other modules' calls. One small backend change (CORS) is required.

**Tech Stack:** Node 20, npm. Frontend: Vite 5, React 18, TypeScript 5, react-router-dom 6, @tanstack/react-query 5, react-hook-form 7, zod 3, axios 1, MUI 5 (@mui/material, @mui/x-data-grid, @mui/icons-material), Vitest + @testing-library/react + msw (tests). Backend (unchanged stack, one file touched): NestJS 11.

**Spec:** `docs/superpowers/specs/2026-08-29-frontend-design.md`

## Global Constraints

- API base URL: `http://localhost:3000/api/v1` (backend `API_PREFIX = 'api/v1'`, `src/setup-app.ts:6`). Frontend reads it from `VITE_API_BASE_URL`, default `http://localhost:3000/api/v1`.
- Auth: JWT only for role `ADMIN`/`EMPLOYEE`. No client/mechanic/estoquista login exists — one staff user drives every screen. Access token kept in memory only (React state), refresh token in `localStorage` under key `oficina.refreshToken`.
- On any 401 response (except from `/auth/login` and `/auth/refresh` themselves), attempt one `/auth/refresh`; on refresh failure, clear session and redirect to `/login`.
- `ServiceOrderStatus` values: `RECEIVED | IN_DIAGNOSIS | AWAITING_APPROVAL | AWAITING_PARTS | IN_PROGRESS | COMPLETED | DELIVERED | CANCELLED`. Allowed transitions (mirror only, backend is authoritative): `RECEIVED→[IN_DIAGNOSIS,CANCELLED]`, `IN_DIAGNOSIS→[AWAITING_APPROVAL,CANCELLED]`, `AWAITING_APPROVAL→[AWAITING_PARTS,IN_PROGRESS,CANCELLED]`, `AWAITING_PARTS→[IN_PROGRESS,CANCELLED]`, `IN_PROGRESS→[COMPLETED,CANCELLED]`, `COMPLETED→[DELIVERED]`, `DELIVERED|CANCELLED→[]`.
- Only `assign` (`PATCH /service-orders/:id/assign`), `complete` (`PATCH /service-orders/:id/complete`) and `cancel` (`PATCH /service-orders/:id/cancel`) are direct OS status endpoints. `AWAITING_APPROVAL`, `AWAITING_PARTS`, `DELIVERED` only happen as side effects of budget/parts-dispatch/billing calls — never expose a generic "set status" control for those.
- Money fields (`unitPrice`, `totalAmount`, `amount`, etc.) are plain decimal `number` in JSON (not cents) — format with `Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'})`, don't reinterpret as cents.
- All list/detail responses use ISO-8601 date strings for `createdAt`/`updatedAt`/etc — format with `date-fns` or `toLocaleString('pt-BR')`, never assume `Date` objects.
- Every task ends with a commit. Commit style: `feat: <description>` (matches backend repo convention).
- Test runner: Vitest, run via `npm test`. Every task's tests must pass before commit.

---

## File Structure

New repo `C:/oficina-fiap-api-frontend`:

```
src/
  main.tsx                     — ReactDOM root, providers (QueryClientProvider, ThemeProvider, AuthProvider, BrowserRouter)
  App.tsx                      — routes.tsx consumer
  theme.ts                     — MUI theme
  routes.tsx                   — route table
  lib/
    apiClient.ts                — axios instance + interceptors
    createCrudApi.ts             — generic REST CRUD helper reused by simple-CRUD features
    queryClient.ts               — QueryClient instance + query key helpers
  components/
    Layout.tsx                  — sidebar + topbar shell
    NavItem.tsx
    ConfirmDialog.tsx
    StatusChip.tsx               — generic colored chip for any status enum
  features/
    auth/            (api.ts, types.ts, AuthContext.tsx, useAuth.ts, LoginPage.tsx, ProtectedRoute.tsx)
    clients/          (api.ts, types.ts, hooks.ts, pages/ClientsPage.tsx, pages/ClientFormDialog.tsx)
    vehicles/          (api.ts, types.ts, hooks.ts, pages/VehiclesPage.tsx, pages/VehicleFormDialog.tsx)
    service-catalog/    (api.ts, types.ts, hooks.ts, pages/ServicesPage.tsx, pages/ServiceFormDialog.tsx)
    parts/               (api.ts, types.ts, hooks.ts, pages/PartsPage.tsx, pages/PartFormDialog.tsx, pages/StockMovementDialog.tsx)
    purchase-orders/      (api.ts, types.ts, hooks.ts, pages/PurchaseOrdersPage.tsx, pages/PurchaseOrderDetailPage.tsx)
    service-orders/       (api.ts, types.ts, hooks.ts, pages/ServiceOrdersPage.tsx, pages/ServiceOrderDetailPage.tsx, components/AssignMechanicDialog.tsx, components/CancelOrderDialog.tsx)
    budgets/               (api.ts, types.ts, hooks.ts, components/BudgetTab.tsx, components/BudgetItemFormDialog.tsx)
    billing/                (api.ts, types.ts, hooks.ts, components/BillingTab.tsx, pages/BillingPage.tsx)
    notifications/          (api.ts, types.ts, hooks.ts, pages/NotificationsPage.tsx)
    dashboard/               (pages/DashboardPage.tsx)
  test/
    setup.ts             — jest-dom matchers + MSW server lifecycle
    server.ts             — MSW server instance
    handlers/             — one handlers file per feature, merged in setup.ts
```

---

### Task 0: Backend CORS

**Files:**
- Modify: `c:\oficina-fiap-api\src\setup-app.ts:8-33`
- Modify: `c:\oficina-fiap-api\.env.sample`
- Test: `c:\oficina-fiap-api\test\cors.e2e-spec.ts`

**Interfaces:**
- Produces: backend responds to cross-origin requests from `FRONTEND_ORIGIN` (default `http://localhost:5173`) with `Access-Control-Allow-Origin` header, `Access-Control-Allow-Credentials: true`.

- [ ] **Step 1: Write failing e2e test**

`c:\oficina-fiap-api\test\cors.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/database/prisma.service';
import { configureApp } from '../src/setup-app';

describe('CORS (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    app = configureApp(
      moduleFixture.createNestApplication(),
    ) as INestApplication<App>;
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('libera origem do frontend com credentials', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:5173')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- cors.e2e-spec.ts`
Expected: FAIL — no `access-control-allow-origin` header present.

- [ ] **Step 3: Add CORS config**

In `c:\oficina-fiap-api\.env.sample`, after the `PORT` line, add:

```
# Origem do frontend liberada via CORS
FRONTEND_ORIGIN=http://localhost:5173
```

In `c:\oficina-fiap-api\src\setup-app.ts`, add inside `configureApp`, right after `app.setGlobalPrefix(API_PREFIX);`:

```ts
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:e2e -- cors.e2e-spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/setup-app.ts .env.sample test/cors.e2e-spec.ts
git commit -m "feat: liberar CORS para o frontend"
```

---

### Task 1: Scaffold Vite project, theme, test infra

**Files:**
- Create: `C:/oficina-fiap-api-frontend/` (new repo, via `npm create vite@latest`)
- Create: `C:/oficina-fiap-api-frontend/package.json`, `vite.config.ts`, `tsconfig.json`
- Create: `C:/oficina-fiap-api-frontend/src/theme.ts`
- Create: `C:/oficina-fiap-api-frontend/src/main.tsx`
- Create: `C:/oficina-fiap-api-frontend/src/App.tsx`
- Create: `C:/oficina-fiap-api-frontend/src/test/setup.ts`
- Create: `C:/oficina-fiap-api-frontend/src/test/server.ts`
- Create: `C:/oficina-fiap-api-frontend/.env.development`
- Test: `C:/oficina-fiap-api-frontend/src/App.test.tsx`

**Interfaces:**
- Produces: `theme` (default export of `src/theme.ts`, a `Theme` from `@mui/material/styles`).
- Produces: `src/test/server.ts` exports `server` (MSW `SetupServerApi`) and `resetHandlers()`; `src/test/setup.ts` wires `beforeAll(() => server.listen())`, `afterEach(() => server.resetHandlers())`, `afterAll(() => server.close())`.
- Produces: `App` component (default export `src/App.tsx`) rendering a static placeholder — later tasks replace its body with `<RouterProvider>`/routes, but the shell (providers) stays.

- [ ] **Step 1: Scaffold via Vite**

```bash
cd C:/
npm create vite@latest oficina-fiap-api-frontend -- --template react-ts
cd C:/oficina-fiap-api-frontend
npm install
```

- [ ] **Step 2: Install dependencies**

```bash
npm install react-router-dom @tanstack/react-query axios react-hook-form zod @hookform/resolvers @mui/material @mui/x-data-grid @mui/icons-material @emotion/react @emotion/styled date-fns
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom msw @tanstack/react-query-devtools
```

- [ ] **Step 3: Configure Vitest in `vite.config.ts`**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
});
```

Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 4: Write MSW server + Vitest setup**

`src/test/server.ts`:

```ts
import { setupServer } from 'msw/node';

export const server = setupServer();
```

`src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

- [ ] **Step 5: Write theme**

`src/theme.ts`:

```ts
import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary: { main: '#1565c0' },
    secondary: { main: '#ef6c00' },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
  },
});

export default theme;
```

- [ ] **Step 6: Write failing App test**

`src/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('renderiza o titulo da aplicacao', () => {
    render(<App />);
    expect(screen.getByText('Oficina FIAP')).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test -- App.test.tsx`
Expected: FAIL — default Vite template markup doesn't contain "Oficina FIAP".

- [ ] **Step 8: Write minimal `App.tsx` and wire providers in `main.tsx`**

`src/App.tsx`:

```tsx
export default function App() {
  return <div>Oficina FIAP</div>;
}
```

`src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import theme from './theme';
import { queryClient } from './lib/queryClient';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
```

`src/lib/queryClient.ts`:

```ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});
```

`.env.development`:

```
VITE_API_BASE_URL=http://localhost:3000/api/v1
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test -- App.test.tsx`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git init
git add -A
git commit -m "feat: scaffold Vite+React+TS project with MUI, React Query, test infra"
```

---

### Task 2: API client and generic CRUD helper

**Files:**
- Create: `src/lib/apiClient.ts`
- Create: `src/lib/createCrudApi.ts`
- Create: `src/lib/apiError.ts`
- Test: `src/lib/apiClient.test.ts`
- Test: `src/lib/createCrudApi.test.ts`

**Interfaces:**
- Produces: `apiClient` (default export, `AxiosInstance`) — base URL from `import.meta.env.VITE_API_BASE_URL`, `Authorization` header injected from `getAccessToken()` (a module-level getter set by the auth feature via `setAccessTokenGetter(fn)`).
- Produces: `setAccessTokenGetter(getter: () => string | null): void`, `setUnauthorizedHandler(handler: () => void): void` — auth feature (Task 3) calls these once at startup; `apiClient`'s interceptors call `getter()`/`handler()` internally.
- Produces: `ApiError` class (`src/lib/apiError.ts`) — `{ status: number; message: string; details?: unknown }`, thrown by `apiClient`'s response interceptor for any non-2xx response.
- Produces: `createCrudApi<TResponse, TCreate, TUpdate = Partial<TCreate>>(resourcePath: string)` returning `{ list(params?): Promise<TResponse[]>; getById(id: string): Promise<TResponse>; create(data: TCreate): Promise<TResponse>; update(id: string, data: TUpdate): Promise<TResponse>; remove(id: string): Promise<void>; }`.

- [ ] **Step 1: Write failing apiClient test**

`src/lib/apiClient.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import apiClient, { setAccessTokenGetter } from './apiClient';
import { ApiError } from './apiError';

describe('apiClient', () => {
  beforeEach(() => {
    setAccessTokenGetter(() => null);
  });

  it('injeta Authorization quando ha access token', async () => {
    setAccessTokenGetter(() => 'token-123');
    let receivedAuth: string | null = null;

    server.use(
      http.get('http://localhost:3000/api/v1/ping', ({ request }) => {
        receivedAuth = request.headers.get('authorization');
        return HttpResponse.json({ ok: true });
      }),
    );

    await apiClient.get('/ping');
    expect(receivedAuth).toBe('Bearer token-123');
  });

  it('lanca ApiError com status e message em resposta de erro', async () => {
    server.use(
      http.get('http://localhost:3000/api/v1/broken', () =>
        HttpResponse.json({ message: 'Recurso invalido' }, { status: 400 }),
      ),
    );

    await expect(apiClient.get('/broken')).rejects.toMatchObject({
      status: 400,
      message: 'Recurso invalido',
    } satisfies Partial<ApiError>);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- apiClient.test.ts`
Expected: FAIL — `./apiClient` does not exist.

- [ ] **Step 3: Implement `apiError.ts` and `apiClient.ts`**

`src/lib/apiError.ts`:

```ts
export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}
```

`src/lib/apiClient.ts`:

```ts
import axios from 'axios';
import { ApiError } from './apiError';

let accessTokenGetter: () => string | null = () => null;
let unauthorizedHandler: () => void = () => {};

export function setAccessTokenGetter(getter: () => string | null): void {
  accessTokenGetter = getter;
}

export function setUnauthorizedHandler(handler: () => void): void {
  unauthorizedHandler = handler;
}

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1',
});

apiClient.interceptors.request.use((config) => {
  const token = accessTokenGetter();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response) {
      const { status, data } = error.response;
      const message =
        (data as { message?: string | string[] })?.message ?? error.message;
      if (status === 401) {
        unauthorizedHandler();
      }
      return Promise.reject(
        new ApiError(
          status,
          Array.isArray(message) ? message.join(', ') : message,
          data,
        ),
      );
    }
    return Promise.reject(error);
  },
);

export default apiClient;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- apiClient.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing createCrudApi test**

`src/lib/createCrudApi.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { createCrudApi } from './createCrudApi';

interface Widget {
  id: string;
  name: string;
}

const widgetsApi = createCrudApi<Widget, { name: string }>('/widgets');

describe('createCrudApi', () => {
  it('lista, cria e remove um recurso', async () => {
    server.use(
      http.get('http://localhost:3000/api/v1/widgets', () =>
        HttpResponse.json([{ id: '1', name: 'Parafuso' }]),
      ),
      http.post('http://localhost:3000/api/v1/widgets', async ({ request }) => {
        const body = (await request.json()) as { name: string };
        return HttpResponse.json({ id: '2', name: body.name }, { status: 201 });
      }),
      http.delete('http://localhost:3000/api/v1/widgets/2', () =>
        new HttpResponse(null, { status: 204 }),
      ),
    );

    const list = await widgetsApi.list();
    expect(list).toEqual([{ id: '1', name: 'Parafuso' }]);

    const created = await widgetsApi.create({ name: 'Porca' });
    expect(created).toEqual({ id: '2', name: 'Porca' });

    await expect(widgetsApi.remove('2')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- createCrudApi.test.ts`
Expected: FAIL — `./createCrudApi` does not exist.

- [ ] **Step 7: Implement `createCrudApi.ts`**

```ts
import apiClient from './apiClient';

export function createCrudApi<TResponse, TCreate, TUpdate = Partial<TCreate>>(
  resourcePath: string,
) {
  return {
    async list(params?: Record<string, string>): Promise<TResponse[]> {
      const { data } = await apiClient.get<TResponse[]>(resourcePath, {
        params,
      });
      return data;
    },
    async getById(id: string): Promise<TResponse> {
      const { data } = await apiClient.get<TResponse>(`${resourcePath}/${id}`);
      return data;
    },
    async create(payload: TCreate): Promise<TResponse> {
      const { data } = await apiClient.post<TResponse>(resourcePath, payload);
      return data;
    },
    async update(id: string, payload: TUpdate): Promise<TResponse> {
      const { data } = await apiClient.patch<TResponse>(
        `${resourcePath}/${id}`,
        payload,
      );
      return data;
    },
    async remove(id: string): Promise<void> {
      await apiClient.delete(`${resourcePath}/${id}`);
    },
  };
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- createCrudApi.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/lib/apiClient.ts src/lib/apiError.ts src/lib/createCrudApi.ts src/lib/apiClient.test.ts src/lib/createCrudApi.test.ts
git commit -m "feat: add API client with auth interceptors and generic CRUD helper"
```

---

### Task 3: Auth feature (login, token refresh, protected routes)

**Files:**
- Create: `src/features/auth/types.ts`
- Create: `src/features/auth/api.ts`
- Create: `src/features/auth/AuthContext.tsx`
- Create: `src/features/auth/useAuth.ts`
- Create: `src/features/auth/LoginPage.tsx`
- Create: `src/features/auth/ProtectedRoute.tsx`
- Test: `src/features/auth/AuthContext.test.tsx`
- Test: `src/features/auth/LoginPage.test.tsx`

**Interfaces:**
- Consumes: `apiClient` default export, `setAccessTokenGetter`, `setUnauthorizedHandler` from `../../lib/apiClient.ts` (Task 2).
- Produces: `TokenPair { accessToken: string; refreshToken: string }`, `JwtPayload { sub: string; email: string; role: 'ADMIN' | 'EMPLOYEE'; exp: number }` (`types.ts`).
- Produces: `login(email: string, password: string): Promise<TokenPair>`, `refresh(refreshToken: string): Promise<TokenPair>`, `logout(refreshToken: string): Promise<void>` (`api.ts`).
- Produces: `AuthProvider` (children prop), `useAuth()` returning `{ user: JwtPayload | null; isAuthenticated: boolean; login(email, password): Promise<void>; logout(): Promise<void> }`.
- Produces: `ProtectedRoute` component — `{ roles?: Array<'ADMIN'|'EMPLOYEE'>; children: ReactNode }`, redirects to `/login` if unauthenticated, or renders `children` (403 message if role mismatch).

- [ ] **Step 1: Write failing AuthContext test**

`src/features/auth/AuthContext.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/server';
import { AuthProvider } from './AuthContext';
import { useAuth } from './useAuth';

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'none' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.sig`;
}

function Probe() {
  const { user, isAuthenticated, login } = useAuth();
  return (
    <div>
      <span data-testid="status">
        {isAuthenticated ? `logged:${user?.role}` : 'anon'}
      </span>
      <button onClick={() => login('admin@x.com', 'secret')}>login</button>
    </div>
  );
}

describe('AuthContext', () => {
  it('autentica e expõe role do JWT', async () => {
    const accessToken = makeJwt({
      sub: '1',
      email: 'admin@x.com',
      role: 'ADMIN',
      exp: Math.floor(Date.now() / 1000) + 900,
    });

    server.use(
      http.post('http://localhost:3000/api/v1/auth/login', () =>
        HttpResponse.json({ accessToken, refreshToken: 'refresh-token' }),
      ),
    );

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(screen.getByTestId('status')).toHaveTextContent('anon');
    await userEvent.click(screen.getByText('login'));
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('logged:ADMIN'),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- AuthContext.test.tsx`
Expected: FAIL — `./AuthContext` does not exist.

- [ ] **Step 3: Implement `types.ts` and `api.ts`**

`src/features/auth/types.ts`:

```ts
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: 'ADMIN' | 'EMPLOYEE';
  exp: number;
}
```

`src/features/auth/api.ts`:

```ts
import apiClient from '../../lib/apiClient';
import { TokenPair } from './types';

export async function login(
  email: string,
  password: string,
): Promise<TokenPair> {
  const { data } = await apiClient.post<TokenPair>('/auth/login', {
    email,
    password,
  });
  return data;
}

export async function refresh(refreshToken: string): Promise<TokenPair> {
  const { data } = await apiClient.post<TokenPair>('/auth/refresh', {
    refreshToken,
  });
  return data;
}

export async function logout(refreshToken: string): Promise<void> {
  await apiClient.post('/auth/logout', { refreshToken });
}
```

- [ ] **Step 4: Implement `AuthContext.tsx` and `useAuth.ts`**

`src/features/auth/AuthContext.tsx`:

```tsx
import {
  createContext,
  ReactNode,
  useCallback,
  useMemo,
  useState,
} from 'react';
import { setAccessTokenGetter, setUnauthorizedHandler } from '../../lib/apiClient';
import * as authApi from './api';
import { JwtPayload, TokenPair } from './types';

const REFRESH_TOKEN_KEY = 'oficina.refreshToken';

function decodeJwt(token: string): JwtPayload {
  const [, payload] = token.split('.');
  return JSON.parse(atob(payload)) as JwtPayload;
}

interface AuthContextValue {
  user: JwtPayload | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<JwtPayload | null>(null);

  const applyTokenPair = useCallback((tokens: TokenPair) => {
    setAccessToken(tokens.accessToken);
    setUser(decodeJwt(tokens.accessToken));
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }, []);

  setAccessTokenGetter(() => accessToken);
  setUnauthorizedHandler(() => {
    const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!storedRefreshToken) {
      clearSession();
      return;
    }
    authApi
      .refresh(storedRefreshToken)
      .then(applyTokenPair)
      .catch(() => clearSession());
  });

  const login = useCallback(
    async (email: string, password: string) => {
      const tokens = await authApi.login(email, password);
      applyTokenPair(tokens);
    },
    [applyTokenPair],
  );

  const logoutFn = useCallback(async () => {
    const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (storedRefreshToken) {
      await authApi.logout(storedRefreshToken).catch(() => undefined);
    }
    clearSession();
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(accessToken),
      login,
      logout: logoutFn,
    }),
    [user, accessToken, login, logoutFn],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

`src/features/auth/useAuth.ts`:

```ts
import { useContext } from 'react';
import { AuthContext } from './AuthContext';

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return ctx;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- AuthContext.test.tsx`
Expected: PASS

- [ ] **Step 6: Write failing LoginPage test**

`src/features/auth/LoginPage.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/server';
import { AuthProvider } from './AuthContext';
import LoginPage from './LoginPage';

describe('LoginPage', () => {
  it('mostra erro quando credenciais sao invalidas', async () => {
    server.use(
      http.post('http://localhost:3000/api/v1/auth/login', () =>
        HttpResponse.json({ message: 'Credenciais invalidas' }, { status: 401 }),
      ),
    );

    render(
      <MemoryRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com');
    await userEvent.type(screen.getByLabelText(/senha/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));

    await waitFor(() =>
      expect(screen.getByText('Credenciais invalidas')).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test -- LoginPage.test.tsx`
Expected: FAIL — `./LoginPage` does not exist.

- [ ] **Step 8: Implement `LoginPage.tsx` and `ProtectedRoute.tsx`**

`src/features/auth/LoginPage.tsx`:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Paper, TextField, Typography } from '@mui/material';
import { ApiError } from '../../lib/apiError';
import { useAuth } from './useAuth';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao entrar');
    }
  }

  return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
      <Paper component="form" onSubmit={handleSubmit} sx={{ p: 4, width: 360 }}>
        <Typography variant="h5" mb={2}>
          Oficina FIAP
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <TextField
          label="Email"
          fullWidth
          margin="normal"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label="Senha"
          type="password"
          fullWidth
          margin="normal"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" variant="contained" fullWidth sx={{ mt: 2 }}>
          Entrar
        </Button>
      </Paper>
    </Box>
  );
}
```

`src/features/auth/ProtectedRoute.tsx`:

```tsx
import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Alert } from '@mui/material';
import { useAuth } from './useAuth';

export function ProtectedRoute({
  roles,
  children,
}: {
  roles?: Array<'ADMIN' | 'EMPLOYEE'>;
  children: ReactNode;
}) {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (roles && user && !roles.includes(user.role)) {
    return <Alert severity="warning">Sem permissão para acessar esta página.</Alert>;
  }

  return <>{children}</>;
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test -- LoginPage.test.tsx`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/features/auth
git commit -m "feat: add auth feature with login, token refresh and protected routes"
```

---

### Task 4: App shell — Layout, nav, route table

**Files:**
- Create: `src/components/Layout.tsx`
- Create: `src/components/NavItem.tsx`
- Create: `src/features/dashboard/pages/DashboardPage.tsx`
- Create: `src/routes.tsx`
- Modify: `src/App.tsx`
- Test: `src/routes.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` (Task 3), `ProtectedRoute` (Task 3).
- Produces: `NAV_ITEMS: Array<{ label: string; path: string; roles?: Array<'ADMIN'|'EMPLOYEE'> }>` (exported from `src/components/Layout.tsx`) — later tasks (5–15) each add one entry by modifying this array in place.
- Produces: `AppRoutes` (default export `src/routes.tsx`) — a `<Routes>` tree; later tasks each add one `<Route>` inside the authenticated subtree by modifying this file.
- Produces: `DashboardPage` (default export) — placeholder body `<Typography variant="h4">Dashboard</Typography>`; Task 15 replaces its body with real metrics, same file.

- [ ] **Step 1: Write failing routing test**

`src/routes.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AuthProvider } from './features/auth/AuthContext';
import AppRoutes from './routes';

describe('AppRoutes', () => {
  it('redireciona para /login quando nao autenticado', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Oficina FIAP' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- routes.test.tsx`
Expected: FAIL — `./routes` does not exist.

- [ ] **Step 3: Implement `Layout.tsx`, `NavItem.tsx`, `DashboardPage.tsx`, `routes.tsx`**

`src/components/NavItem.tsx`:

```tsx
import { ListItemButton, ListItemText } from '@mui/material';
import { NavLink } from 'react-router-dom';

export function NavItem({ label, path }: { label: string; path: string }) {
  return (
    <ListItemButton component={NavLink} to={path} end={path === '/'}>
      <ListItemText primary={label} />
    </ListItemButton>
  );
}
```

`src/components/Layout.tsx`:

```tsx
import { ReactNode } from 'react';
import { AppBar, Box, Drawer, List, Toolbar, Typography, Button } from '@mui/material';
import { useAuth } from '../features/auth/useAuth';
import { NavItem } from './NavItem';

export interface NavEntry {
  label: string;
  path: string;
  roles?: Array<'ADMIN' | 'EMPLOYEE'>;
}

export const NAV_ITEMS: NavEntry[] = [{ label: 'Dashboard', path: '/' }];

const DRAWER_WIDTH = 240;

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || (user && item.roles.includes(user.role)),
  );

  return (
    <Box display="flex">
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          <Typography variant="h6">Oficina FIAP</Typography>
          <Button color="inherit" onClick={() => logout()}>
            Sair
          </Button>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{ width: DRAWER_WIDTH, [`& .MuiDrawer-paper`]: { width: DRAWER_WIDTH } }}
      >
        <Toolbar />
        <List>
          {visibleItems.map((item) => (
            <NavItem key={item.path} label={item.label} path={item.path} />
          ))}
        </List>
      </Drawer>
      <Box component="main" flexGrow={1} p={3}>
        <Toolbar />
        {children}
      </Box>
    </Box>
  );
}
```

`src/features/dashboard/pages/DashboardPage.tsx`:

```tsx
import { Typography } from '@mui/material';

export default function DashboardPage() {
  return <Typography variant="h4">Dashboard</Typography>;
}
```

`src/routes.tsx`:

```tsx
import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import LoginPage from './features/auth/LoginPage';
import DashboardPage from './features/dashboard/pages/DashboardPage';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
```

- [ ] **Step 4: Wire `AppRoutes` into `App.tsx`, remove old placeholder**

`src/App.tsx`:

```tsx
import AppRoutes from './routes';

export default function App() {
  return <AppRoutes />;
}
```

Delete `src/App.test.tsx` (Task 1's placeholder test — its "Oficina FIAP" assertion is now covered by `routes.test.tsx`, which asserts the same string appears on the redirected `/login` heading).

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all suites, including `routes.test.tsx`)

- [ ] **Step 6: Commit**

```bash
git add src/components src/features/dashboard src/routes.tsx src/App.tsx src/routes.test.tsx
git rm src/App.test.tsx
git commit -m "feat: add app shell with layout, nav and route table"
```

---

### Task 5: Clients feature (list + create/edit)

This task establishes the CRUD feature pattern (`api.ts` via `createCrudApi`, `hooks.ts` via React Query, list page with `DataGrid`, form in a dialog with `react-hook-form`+`zod`) reused as-is by Tasks 6–9.

**Files:**
- Create: `src/features/clients/types.ts`
- Create: `src/features/clients/api.ts`
- Create: `src/features/clients/hooks.ts`
- Create: `src/features/clients/pages/ClientsPage.tsx`
- Create: `src/features/clients/pages/ClientFormDialog.tsx`
- Modify: `src/routes.tsx` — add `<Route path="/clientes" element={<ClientsPage />} />` inside the authenticated `<Routes>`
- Modify: `src/components/Layout.tsx:12` (`NAV_ITEMS`) — add `{ label: 'Clientes', path: '/clientes' }`
- Test: `src/features/clients/pages/ClientsPage.test.tsx`

**Interfaces:**
- Consumes: `createCrudApi` (Task 2).
- Produces: `Client { id: string; name: string; document: string; email: string; phone: string; createdAt: string; updatedAt: string }`, `CreateClientPayload { name: string; document: string; email: string; phone: string }`, `UpdateClientPayload { name?: string; email?: string; phone?: string }` (`types.ts`).
- Produces: `useClients()`, `useCreateClient()`, `useUpdateClient()`, `useDeleteClient()` (`hooks.ts`), query key `['clients']`.

- [ ] **Step 1: Write failing ClientsPage test**

`src/features/clients/pages/ClientsPage.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test/server';
import ClientsPage from './ClientsPage';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ClientsPage />
    </QueryClientProvider>,
  );
}

describe('ClientsPage', () => {
  it('lista clientes existentes e cria um novo', async () => {
    server.use(
      http.get('http://localhost:3000/api/v1/clients', () =>
        HttpResponse.json([
          {
            id: '1',
            name: 'Maria Souza',
            document: '12345678900',
            email: 'maria@x.com',
            phone: '11999990000',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ]),
      ),
      http.post('http://localhost:3000/api/v1/clients', async ({ request }) => {
        const body = (await request.json()) as { name: string };
        return HttpResponse.json(
          {
            id: '2',
            name: body.name,
            document: '00000000000',
            email: 'novo@x.com',
            phone: '11888880000',
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
          },
          { status: 201 },
        );
      }),
    );

    renderPage();

    await waitFor(() =>
      expect(screen.getByText('Maria Souza')).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole('button', { name: /novo cliente/i }));
    await userEvent.type(screen.getByLabelText(/nome/i), 'Joao Lima');
    await userEvent.type(screen.getByLabelText(/documento/i), '00000000000');
    await userEvent.type(screen.getByLabelText(/^email/i), 'novo@x.com');
    await userEvent.type(screen.getByLabelText(/telefone/i), '11888880000');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() =>
      expect(screen.getByText('Joao Lima')).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ClientsPage.test.tsx`
Expected: FAIL — `./ClientsPage` does not exist.

- [ ] **Step 3: Implement `types.ts`, `api.ts`, `hooks.ts`**

`src/features/clients/types.ts`:

```ts
export interface Client {
  id: string;
  name: string;
  document: string;
  email: string;
  phone: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateClientPayload {
  name: string;
  document: string;
  email: string;
  phone: string;
}

export interface UpdateClientPayload {
  name?: string;
  email?: string;
  phone?: string;
}
```

`src/features/clients/api.ts`:

```ts
import { createCrudApi } from '../../lib/createCrudApi';
import { Client, CreateClientPayload, UpdateClientPayload } from './types';

export const clientsApi = createCrudApi<
  Client,
  CreateClientPayload,
  UpdateClientPayload
>('/clients');
```

`src/features/clients/hooks.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clientsApi } from './api';
import { CreateClientPayload, UpdateClientPayload } from './types';

const CLIENTS_KEY = ['clients'];

export function useClients() {
  return useQuery({ queryKey: CLIENTS_KEY, queryFn: () => clientsApi.list() });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateClientPayload) => clientsApi.create(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLIENTS_KEY }),
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateClientPayload }) =>
      clientsApi.update(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLIENTS_KEY }),
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => clientsApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLIENTS_KEY }),
  });
}
```

- [ ] **Step 4: Implement `ClientFormDialog.tsx` and `ClientsPage.tsx`**

`src/features/clients/pages/ClientFormDialog.tsx`:

```tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';
import { Client } from '../types';

const schema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  document: z.string().min(1, 'Documento obrigatório'),
  email: z.string().email('Email inválido'),
  phone: z.string().min(1, 'Telefone obrigatório'),
});

export type ClientFormValues = z.infer<typeof schema>;

export function ClientFormDialog({
  open,
  initialValue,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initialValue?: Client;
  onClose: () => void;
  onSubmit: (values: ClientFormValues) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(schema),
    values: initialValue
      ? {
          name: initialValue.name,
          document: initialValue.document,
          email: initialValue.email,
          phone: initialValue.phone,
        }
      : { name: '', document: '', email: '', phone: '' },
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{initialValue ? 'Editar cliente' : 'Novo cliente'}</DialogTitle>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label="Nome"
            {...register('name')}
            error={!!errors.name}
            helperText={errors.name?.message}
          />
          <TextField
            label="Documento"
            disabled={!!initialValue}
            {...register('document')}
            error={!!errors.document}
            helperText={errors.document?.message}
          />
          <TextField
            label="Email"
            {...register('email')}
            error={!!errors.email}
            helperText={errors.email?.message}
          />
          <TextField
            label="Telefone"
            {...register('phone')}
            error={!!errors.phone}
            helperText={errors.phone?.message}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="contained">
            Salvar
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
```

`src/features/clients/pages/ClientsPage.tsx`:

```tsx
import { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { useClients, useCreateClient, useUpdateClient } from '../hooks';
import { Client } from '../types';
import { ClientFormDialog, ClientFormValues } from './ClientFormDialog';

const columns: GridColDef<Client>[] = [
  { field: 'name', headerName: 'Nome', flex: 1 },
  { field: 'document', headerName: 'Documento', flex: 1 },
  { field: 'email', headerName: 'Email', flex: 1 },
  { field: 'phone', headerName: 'Telefone', flex: 1 },
];

export default function ClientsPage() {
  const { data: clients = [], isLoading } = useClients();
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Client | undefined>(undefined);

  function openCreateDialog() {
    setEditing(undefined);
    setDialogOpen(true);
  }

  function handleSubmit(values: ClientFormValues) {
    const request = editing
      ? updateClient.mutateAsync({ id: editing.id, payload: values })
      : createClient.mutateAsync(values);
    request.then(() => setDialogOpen(false));
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h4">Clientes</Typography>
        <Button variant="contained" onClick={openCreateDialog}>
          Novo Cliente
        </Button>
      </Box>
      <DataGrid
        rows={clients}
        columns={columns}
        loading={isLoading}
        onRowDoubleClick={(params) => {
          setEditing(params.row as Client);
          setDialogOpen(true);
        }}
        autoHeight
      />
      <ClientFormDialog
        open={dialogOpen}
        initialValue={editing}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleSubmit}
      />
    </Box>
  );
}
```

- [ ] **Step 5: Wire route and nav entry**

In `src/routes.tsx`, import `ClientsPage` and add inside the nested `<Routes>`:

```tsx
<Route path="/clientes" element={<ClientsPage />} />
```

In `src/components/Layout.tsx`, change `NAV_ITEMS` to:

```tsx
export const NAV_ITEMS: NavEntry[] = [
  { label: 'Dashboard', path: '/' },
  { label: 'Clientes', path: '/clientes' },
];
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- ClientsPage.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/clients src/routes.tsx src/components/Layout.tsx
git commit -m "feat: add clients CRUD feature"
```

---

### Task 6: Vehicles feature (list + create/edit, linked to Client)

**Files:**
- Create: `src/features/vehicles/types.ts`
- Create: `src/features/vehicles/api.ts`
- Create: `src/features/vehicles/hooks.ts`
- Create: `src/features/vehicles/pages/VehiclesPage.tsx`
- Create: `src/features/vehicles/pages/VehicleFormDialog.tsx`
- Modify: `src/routes.tsx` — add `<Route path="/veiculos" element={<VehiclesPage />} />`
- Modify: `src/components/Layout.tsx` (`NAV_ITEMS`) — add `{ label: 'Veículos', path: '/veiculos' }`
- Test: `src/features/vehicles/pages/VehiclesPage.test.tsx`

**Interfaces:**
- Consumes: `createCrudApi` (Task 2), `useClients` (Task 5, for the client picker).
- Produces: `Vehicle { id: string; clientId: string; plate: string; brand: string; model: string; year: number; createdAt: string; updatedAt: string }`, `CreateVehiclePayload { clientId: string; plate: string; brand: string; model: string; year: number }`, `UpdateVehiclePayload { brand?: string; model?: string; year?: number }` (`types.ts`).
- Produces: `useVehicles()`, `useCreateVehicle()`, `useUpdateVehicle()` (`hooks.ts`), query key `['vehicles']`.

- [ ] **Step 1: Write failing VehiclesPage test**

`src/features/vehicles/pages/VehiclesPage.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test/server';
import VehiclesPage from './VehiclesPage';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <VehiclesPage />
    </QueryClientProvider>,
  );
}

describe('VehiclesPage', () => {
  it('lista veiculos existentes e cria um novo vinculado a um cliente', async () => {
    server.use(
      http.get('http://localhost:3000/api/v1/clients', () =>
        HttpResponse.json([
          {
            id: 'c1',
            name: 'Maria Souza',
            document: '1',
            email: 'm@x.com',
            phone: '1',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ]),
      ),
      http.get('http://localhost:3000/api/v1/vehicles', () =>
        HttpResponse.json([
          {
            id: 'v1',
            clientId: 'c1',
            plate: 'ABC1234',
            brand: 'Fiat',
            model: 'Uno',
            year: 2015,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ]),
      ),
      http.post('http://localhost:3000/api/v1/vehicles', async ({ request }) => {
        const body = (await request.json()) as { plate: string };
        return HttpResponse.json(
          {
            id: 'v2',
            clientId: 'c1',
            plate: body.plate,
            brand: 'VW',
            model: 'Gol',
            year: 2020,
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
          },
          { status: 201 },
        );
      }),
    );

    renderPage();

    await waitFor(() => expect(screen.getByText('ABC1234')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /novo veiculo/i }));
    await userEvent.type(screen.getByLabelText(/placa/i), 'XYZ9999');
    await userEvent.type(screen.getByLabelText(/marca/i), 'VW');
    await userEvent.type(screen.getByLabelText(/modelo/i), 'Gol');
    await userEvent.type(screen.getByLabelText(/ano/i), '2020');
    await userEvent.click(screen.getByLabelText(/cliente/i));
    await userEvent.click(await screen.findByText('Maria Souza'));
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => expect(screen.getByText('XYZ9999')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- VehiclesPage.test.tsx`
Expected: FAIL — `./VehiclesPage` does not exist.

- [ ] **Step 3: Implement `types.ts`, `api.ts`, `hooks.ts`**

`src/features/vehicles/types.ts`:

```ts
export interface Vehicle {
  id: string;
  clientId: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVehiclePayload {
  clientId: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
}

export interface UpdateVehiclePayload {
  brand?: string;
  model?: string;
  year?: number;
}
```

`src/features/vehicles/api.ts`:

```ts
import { createCrudApi } from '../../lib/createCrudApi';
import { CreateVehiclePayload, UpdateVehiclePayload, Vehicle } from './types';

export const vehiclesApi = createCrudApi<
  Vehicle,
  CreateVehiclePayload,
  UpdateVehiclePayload
>('/vehicles');
```

`src/features/vehicles/hooks.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { vehiclesApi } from './api';
import { CreateVehiclePayload, UpdateVehiclePayload } from './types';

const VEHICLES_KEY = ['vehicles'];

export function useVehicles(clientId?: string) {
  return useQuery({
    queryKey: [...VEHICLES_KEY, clientId ?? 'all'],
    queryFn: () => vehiclesApi.list(clientId ? { clientId } : undefined),
  });
}

export function useCreateVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateVehiclePayload) => vehiclesApi.create(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: VEHICLES_KEY }),
  });
}

export function useUpdateVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateVehiclePayload }) =>
      vehiclesApi.update(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: VEHICLES_KEY }),
  });
}
```

- [ ] **Step 4: Implement `VehicleFormDialog.tsx` and `VehiclesPage.tsx`**

`src/features/vehicles/pages/VehicleFormDialog.tsx`:

```tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';
import { useClients } from '../../clients/hooks';
import { Vehicle } from '../types';

const schema = z.object({
  clientId: z.string().min(1, 'Cliente obrigatório'),
  plate: z.string().min(1, 'Placa obrigatória'),
  brand: z.string().min(1, 'Marca obrigatória'),
  model: z.string().min(1, 'Modelo obrigatório'),
  year: z.coerce.number().int().min(1900, 'Ano inválido'),
});

export type VehicleFormValues = z.infer<typeof schema>;

export function VehicleFormDialog({
  open,
  initialValue,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initialValue?: Vehicle;
  onClose: () => void;
  onSubmit: (values: VehicleFormValues) => void;
}) {
  const { data: clients = [] } = useClients();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<VehicleFormValues>({
    resolver: zodResolver(schema),
    values: initialValue
      ? {
          clientId: initialValue.clientId,
          plate: initialValue.plate,
          brand: initialValue.brand,
          model: initialValue.model,
          year: initialValue.year,
        }
      : { clientId: '', plate: '', brand: '', model: '', year: new Date().getFullYear() },
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{initialValue ? 'Editar veículo' : 'Novo veículo'}</DialogTitle>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Controller
            name="clientId"
            control={control}
            render={({ field }) => (
              <Autocomplete
                disabled={!!initialValue}
                options={clients}
                getOptionLabel={(option) => option.name}
                onChange={(_, value) => field.onChange(value?.id ?? '')}
                value={clients.find((c) => c.id === field.value) ?? null}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Cliente"
                    error={!!errors.clientId}
                    helperText={errors.clientId?.message}
                  />
                )}
              />
            )}
          />
          <TextField
            label="Placa"
            disabled={!!initialValue}
            {...register('plate')}
            error={!!errors.plate}
            helperText={errors.plate?.message}
          />
          <TextField
            label="Marca"
            {...register('brand')}
            error={!!errors.brand}
            helperText={errors.brand?.message}
          />
          <TextField
            label="Modelo"
            {...register('model')}
            error={!!errors.model}
            helperText={errors.model?.message}
          />
          <TextField
            label="Ano"
            type="number"
            {...register('year')}
            error={!!errors.year}
            helperText={errors.year?.message}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="contained">
            Salvar
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
```

`src/features/vehicles/pages/VehiclesPage.tsx`:

```tsx
import { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { useCreateVehicle, useUpdateVehicle, useVehicles } from '../hooks';
import { Vehicle } from '../types';
import { VehicleFormDialog, VehicleFormValues } from './VehicleFormDialog';

const columns: GridColDef<Vehicle>[] = [
  { field: 'plate', headerName: 'Placa', flex: 1 },
  { field: 'brand', headerName: 'Marca', flex: 1 },
  { field: 'model', headerName: 'Modelo', flex: 1 },
  { field: 'year', headerName: 'Ano', flex: 1 },
];

export default function VehiclesPage() {
  const { data: vehicles = [], isLoading } = useVehicles();
  const createVehicle = useCreateVehicle();
  const updateVehicle = useUpdateVehicle();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | undefined>(undefined);

  function handleSubmit(values: VehicleFormValues) {
    const request = editing
      ? updateVehicle.mutateAsync({ id: editing.id, payload: values })
      : createVehicle.mutateAsync(values);
    request.then(() => setDialogOpen(false));
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h4">Veículos</Typography>
        <Button
          variant="contained"
          onClick={() => {
            setEditing(undefined);
            setDialogOpen(true);
          }}
        >
          Novo Veículo
        </Button>
      </Box>
      <DataGrid
        rows={vehicles}
        columns={columns}
        loading={isLoading}
        onRowDoubleClick={(params) => {
          setEditing(params.row as Vehicle);
          setDialogOpen(true);
        }}
        autoHeight
      />
      <VehicleFormDialog
        open={dialogOpen}
        initialValue={editing}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleSubmit}
      />
    </Box>
  );
}
```

- [ ] **Step 5: Wire route and nav entry**

`src/routes.tsx`: add `<Route path="/veiculos" element={<VehiclesPage />} />`.
`src/components/Layout.tsx`: append `{ label: 'Veículos', path: '/veiculos' }` to `NAV_ITEMS`.

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- VehiclesPage.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/vehicles src/routes.tsx src/components/Layout.tsx
git commit -m "feat: add vehicles CRUD feature linked to clients"
```

---

### Task 7: Service Catalog feature (list + create/edit)

**Files:**
- Create: `src/features/service-catalog/types.ts`
- Create: `src/features/service-catalog/api.ts`
- Create: `src/features/service-catalog/hooks.ts`
- Create: `src/features/service-catalog/pages/ServicesPage.tsx`
- Create: `src/features/service-catalog/pages/ServiceFormDialog.tsx`
- Modify: `src/routes.tsx` — add `<Route path="/servicos" element={<ServicesPage />} />`
- Modify: `src/components/Layout.tsx` (`NAV_ITEMS`) — add `{ label: 'Serviços', path: '/servicos' }`
- Test: `src/features/service-catalog/pages/ServicesPage.test.tsx`

**Interfaces:**
- Consumes: `createCrudApi` (Task 2).
- Produces: `ServiceCatalogItem { id: string; name: string; description: string | null; price: number; createdAt: string; updatedAt: string }`, `CreateServicePayload { name: string; description?: string; price: number }`, `UpdateServicePayload { name?: string; description?: string; price?: number }` (`types.ts`).
- Produces: `useServiceCatalog()`, `useCreateServiceCatalogItem()`, `useUpdateServiceCatalogItem()` (`hooks.ts`), query key `['service-catalog']`. (Named `ServiceCatalogItem`/`useServiceCatalog` — not `Service`/`useServices` — to avoid clashing with the `service-orders` feature's naming in Task 10.)

- [ ] **Step 1: Write failing ServicesPage test**

`src/features/service-catalog/pages/ServicesPage.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test/server';
import ServicesPage from './ServicesPage';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ServicesPage />
    </QueryClientProvider>,
  );
}

describe('ServicesPage', () => {
  it('lista servicos do catalogo e cria um novo', async () => {
    server.use(
      http.get('http://localhost:3000/api/v1/services', () =>
        HttpResponse.json([
          {
            id: 's1',
            name: 'Troca de óleo',
            description: null,
            price: 150,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ]),
      ),
      http.post('http://localhost:3000/api/v1/services', async ({ request }) => {
        const body = (await request.json()) as { name: string; price: number };
        return HttpResponse.json(
          {
            id: 's2',
            name: body.name,
            description: null,
            price: body.price,
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
          },
          { status: 201 },
        );
      }),
    );

    renderPage();

    await waitFor(() => expect(screen.getByText('Troca de óleo')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /novo servico/i }));
    await userEvent.type(screen.getByLabelText(/nome/i), 'Alinhamento');
    await userEvent.type(screen.getByLabelText(/preco/i), '80');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => expect(screen.getByText('Alinhamento')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ServicesPage.test.tsx`
Expected: FAIL — `./ServicesPage` does not exist.

- [ ] **Step 3: Implement `types.ts`, `api.ts`, `hooks.ts`**

`src/features/service-catalog/types.ts`:

```ts
export interface ServiceCatalogItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateServicePayload {
  name: string;
  description?: string;
  price: number;
}

export interface UpdateServicePayload {
  name?: string;
  description?: string;
  price?: number;
}
```

`src/features/service-catalog/api.ts`:

```ts
import { createCrudApi } from '../../lib/createCrudApi';
import { CreateServicePayload, ServiceCatalogItem, UpdateServicePayload } from './types';

export const serviceCatalogApi = createCrudApi<
  ServiceCatalogItem,
  CreateServicePayload,
  UpdateServicePayload
>('/services');
```

`src/features/service-catalog/hooks.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { serviceCatalogApi } from './api';
import { CreateServicePayload, UpdateServicePayload } from './types';

const SERVICE_CATALOG_KEY = ['service-catalog'];

export function useServiceCatalog() {
  return useQuery({
    queryKey: SERVICE_CATALOG_KEY,
    queryFn: () => serviceCatalogApi.list(),
  });
}

export function useCreateServiceCatalogItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateServicePayload) => serviceCatalogApi.create(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SERVICE_CATALOG_KEY }),
  });
}

export function useUpdateServiceCatalogItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateServicePayload }) =>
      serviceCatalogApi.update(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SERVICE_CATALOG_KEY }),
  });
}
```

- [ ] **Step 4: Implement `ServiceFormDialog.tsx` and `ServicesPage.tsx`**

`src/features/service-catalog/pages/ServiceFormDialog.tsx`:

```tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';
import { ServiceCatalogItem } from '../types';

const schema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  description: z.string().optional(),
  price: z.coerce.number().positive('Preço deve ser positivo'),
});

export type ServiceFormValues = z.infer<typeof schema>;

export function ServiceFormDialog({
  open,
  initialValue,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initialValue?: ServiceCatalogItem;
  onClose: () => void;
  onSubmit: (values: ServiceFormValues) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ServiceFormValues>({
    resolver: zodResolver(schema),
    values: initialValue
      ? {
          name: initialValue.name,
          description: initialValue.description ?? '',
          price: initialValue.price,
        }
      : { name: '', description: '', price: 0 },
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{initialValue ? 'Editar serviço' : 'Novo serviço'}</DialogTitle>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label="Nome"
            {...register('name')}
            error={!!errors.name}
            helperText={errors.name?.message}
          />
          <TextField label="Descrição" {...register('description')} />
          <TextField
            label="Preço"
            type="number"
            {...register('price')}
            error={!!errors.price}
            helperText={errors.price?.message}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="contained">
            Salvar
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
```

`src/features/service-catalog/pages/ServicesPage.tsx`:

```tsx
import { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import {
  useCreateServiceCatalogItem,
  useServiceCatalog,
  useUpdateServiceCatalogItem,
} from '../hooks';
import { ServiceCatalogItem } from '../types';
import { ServiceFormDialog, ServiceFormValues } from './ServiceFormDialog';

const columns: GridColDef<ServiceCatalogItem>[] = [
  { field: 'name', headerName: 'Nome', flex: 1 },
  {
    field: 'price',
    headerName: 'Preço',
    flex: 1,
    valueFormatter: (value: number) =>
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value),
  },
];

export default function ServicesPage() {
  const { data: services = [], isLoading } = useServiceCatalog();
  const createService = useCreateServiceCatalogItem();
  const updateService = useUpdateServiceCatalogItem();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceCatalogItem | undefined>(undefined);

  function handleSubmit(values: ServiceFormValues) {
    const request = editing
      ? updateService.mutateAsync({ id: editing.id, payload: values })
      : createService.mutateAsync(values);
    request.then(() => setDialogOpen(false));
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h4">Serviços</Typography>
        <Button
          variant="contained"
          onClick={() => {
            setEditing(undefined);
            setDialogOpen(true);
          }}
        >
          Novo Serviço
        </Button>
      </Box>
      <DataGrid
        rows={services}
        columns={columns}
        loading={isLoading}
        onRowDoubleClick={(params) => {
          setEditing(params.row as ServiceCatalogItem);
          setDialogOpen(true);
        }}
        autoHeight
      />
      <ServiceFormDialog
        open={dialogOpen}
        initialValue={editing}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleSubmit}
      />
    </Box>
  );
}
```

- [ ] **Step 5: Wire route and nav entry**

`src/routes.tsx`: add `<Route path="/servicos" element={<ServicesPage />} />`.
`src/components/Layout.tsx`: append `{ label: 'Serviços', path: '/servicos' }` to `NAV_ITEMS`.

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- ServicesPage.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/service-catalog src/routes.tsx src/components/Layout.tsx
git commit -m "feat: add service catalog CRUD feature"
```

---

### Task 8: Parts / Stock feature (list + create/edit + stock movements)

**Files:**
- Create: `src/features/parts/types.ts`
- Create: `src/features/parts/api.ts`
- Create: `src/features/parts/hooks.ts`
- Create: `src/features/parts/pages/PartsPage.tsx`
- Create: `src/features/parts/pages/PartFormDialog.tsx`
- Create: `src/features/parts/pages/StockMovementDialog.tsx`
- Modify: `src/routes.tsx` — add `<Route path="/pecas" element={<PartsPage />} />`
- Modify: `src/components/Layout.tsx` (`NAV_ITEMS`) — add `{ label: 'Peças', path: '/pecas' }`
- Test: `src/features/parts/pages/PartsPage.test.tsx`

**Interfaces:**
- Consumes: `createCrudApi` (Task 2).
- Produces: `Part { id: string; code: string; name: string; description?: string; type: 'PART' | 'SUPPLY'; unit: 'UNIT' | 'LITER' | 'KILOGRAM'; unitPrice: number; quantity: number; minimumQuantity: number; createdAt: string; updatedAt: string }`, `CreatePartPayload { code: string; name: string; description?: string; type: 'PART' | 'SUPPLY'; unit: 'UNIT' | 'LITER' | 'KILOGRAM'; unitPrice: number; minimumQuantity: number }` (`types.ts`).
- Produces: `usePartsList()`, `useCreatePart()`, `useUpdatePart()`, `useRegisterStockMovement()` — `useRegisterStockMovement().mutateAsync({ partId, direction, quantity }: { partId: string; direction: 'in' | 'out'; quantity: number })` (`hooks.ts`), query key `['parts']`.

- [ ] **Step 1: Write failing PartsPage test**

`src/features/parts/pages/PartsPage.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test/server';
import PartsPage from './PartsPage';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PartsPage />
    </QueryClientProvider>,
  );
}

const basePart = {
  id: 'p1',
  code: 'FLT-001',
  name: 'Filtro de óleo',
  description: undefined,
  type: 'PART' as const,
  unit: 'UNIT' as const,
  unitPrice: 25,
  quantity: 10,
  minimumQuantity: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('PartsPage', () => {
  it('lista pecas e registra entrada de estoque', async () => {
    server.use(
      http.get('http://localhost:3000/api/v1/parts', () =>
        HttpResponse.json([basePart]),
      ),
      http.post('http://localhost:3000/api/v1/parts/p1/movements/in', () =>
        HttpResponse.json({
          id: 'm1',
          idempotencyKey: 'any',
          type: 'IN',
          quantity: 5,
          partId: 'p1',
          createdAt: '2026-01-02T00:00:00.000Z',
        }),
      ),
      http.get('http://localhost:3000/api/v1/parts', () =>
        HttpResponse.json([{ ...basePart, quantity: 15 }]),
      ),
    );

    renderPage();

    await waitFor(() => expect(screen.getByText('FLT-001')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /entrada/i }));
    await userEvent.type(screen.getByLabelText(/quantidade/i), '5');
    await userEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    await waitFor(() => expect(screen.getByText('15')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- PartsPage.test.tsx`
Expected: FAIL — `./PartsPage` does not exist.

- [ ] **Step 3: Implement `types.ts`, `api.ts`, `hooks.ts`**

`src/features/parts/types.ts`:

```ts
export type PartType = 'PART' | 'SUPPLY';
export type MeasurementUnit = 'UNIT' | 'LITER' | 'KILOGRAM';

export interface Part {
  id: string;
  code: string;
  name: string;
  description?: string;
  type: PartType;
  unit: MeasurementUnit;
  unitPrice: number;
  quantity: number;
  minimumQuantity: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePartPayload {
  code: string;
  name: string;
  description?: string;
  type: PartType;
  unit: MeasurementUnit;
  unitPrice: number;
  minimumQuantity: number;
}

export type UpdatePartPayload = Partial<CreatePartPayload>;

export interface StockMovement {
  id: string;
  idempotencyKey: string;
  type: 'IN' | 'OUT';
  quantity: number;
  partId: string;
  createdAt: string;
}
```

`src/features/parts/api.ts`:

```ts
import apiClient from '../../lib/apiClient';
import { createCrudApi } from '../../lib/createCrudApi';
import { CreatePartPayload, Part, StockMovement, UpdatePartPayload } from './types';

export const partsApi = createCrudApi<Part, CreatePartPayload, UpdatePartPayload>(
  '/parts',
);

export async function registerMovement(
  partId: string,
  direction: 'in' | 'out',
  quantity: number,
): Promise<StockMovement> {
  const { data } = await apiClient.post<StockMovement>(
    `/parts/${partId}/movements/${direction}`,
    { quantity, idempotencyKey: crypto.randomUUID() },
  );
  return data;
}
```

`src/features/parts/hooks.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { partsApi, registerMovement } from './api';
import { CreatePartPayload, UpdatePartPayload } from './types';

const PARTS_KEY = ['parts'];

export function usePartsList() {
  return useQuery({ queryKey: PARTS_KEY, queryFn: () => partsApi.list() });
}

export function useCreatePart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePartPayload) => partsApi.create(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PARTS_KEY }),
  });
}

export function useUpdatePart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdatePartPayload }) =>
      partsApi.update(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PARTS_KEY }),
  });
}

export function useRegisterStockMovement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      partId,
      direction,
      quantity,
    }: {
      partId: string;
      direction: 'in' | 'out';
      quantity: number;
    }) => registerMovement(partId, direction, quantity),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PARTS_KEY }),
  });
}
```

- [ ] **Step 4: Implement `PartFormDialog.tsx`, `StockMovementDialog.tsx`, `PartsPage.tsx`**

`src/features/parts/pages/PartFormDialog.tsx`:

```tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
} from '@mui/material';
import { Part } from '../types';

const schema = z.object({
  code: z.string().min(1, 'Código obrigatório'),
  name: z.string().min(1, 'Nome obrigatório'),
  description: z.string().optional(),
  type: z.enum(['PART', 'SUPPLY']),
  unit: z.enum(['UNIT', 'LITER', 'KILOGRAM']),
  unitPrice: z.coerce.number().positive('Preço deve ser positivo'),
  minimumQuantity: z.coerce.number().int().min(0),
});

export type PartFormValues = z.infer<typeof schema>;

export function PartFormDialog({
  open,
  initialValue,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initialValue?: Part;
  onClose: () => void;
  onSubmit: (values: PartFormValues) => void;
}) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<PartFormValues>({
    resolver: zodResolver(schema),
    values: initialValue
      ? {
          code: initialValue.code,
          name: initialValue.name,
          description: initialValue.description ?? '',
          type: initialValue.type,
          unit: initialValue.unit,
          unitPrice: initialValue.unitPrice,
          minimumQuantity: initialValue.minimumQuantity,
        }
      : {
          code: '',
          name: '',
          description: '',
          type: 'PART',
          unit: 'UNIT',
          unitPrice: 0,
          minimumQuantity: 0,
        },
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{initialValue ? 'Editar peça' : 'Nova peça'}</DialogTitle>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label="Código"
            {...register('code')}
            error={!!errors.code}
            helperText={errors.code?.message}
          />
          <TextField
            label="Nome"
            {...register('name')}
            error={!!errors.name}
            helperText={errors.name?.message}
          />
          <TextField label="Descrição" {...register('description')} />
          <Controller
            name="type"
            control={control}
            render={({ field }) => (
              <TextField select label="Tipo" {...field}>
                <MenuItem value="PART">Peça</MenuItem>
                <MenuItem value="SUPPLY">Insumo</MenuItem>
              </TextField>
            )}
          />
          <Controller
            name="unit"
            control={control}
            render={({ field }) => (
              <TextField select label="Unidade" {...field}>
                <MenuItem value="UNIT">Unidade</MenuItem>
                <MenuItem value="LITER">Litro</MenuItem>
                <MenuItem value="KILOGRAM">Quilograma</MenuItem>
              </TextField>
            )}
          />
          <TextField
            label="Preço unitário"
            type="number"
            {...register('unitPrice')}
            error={!!errors.unitPrice}
            helperText={errors.unitPrice?.message}
          />
          <TextField
            label="Quantidade mínima"
            type="number"
            {...register('minimumQuantity')}
            error={!!errors.minimumQuantity}
            helperText={errors.minimumQuantity?.message}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="contained">
            Salvar
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
```

`src/features/parts/pages/StockMovementDialog.tsx`:

```tsx
import { useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';

export function StockMovementDialog({
  open,
  direction,
  onClose,
  onConfirm,
}: {
  open: boolean;
  direction: 'in' | 'out';
  onClose: () => void;
  onConfirm: (quantity: number) => void;
}) {
  const [quantity, setQuantity] = useState('');

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{direction === 'in' ? 'Entrada de estoque' : 'Saída de estoque'}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          label="Quantidade"
          type="number"
          fullWidth
          margin="normal"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button
          variant="contained"
          onClick={() => {
            onConfirm(Number(quantity));
            setQuantity('');
          }}
        >
          Confirmar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

`src/features/parts/pages/PartsPage.tsx`:

```tsx
import { useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { useCreatePart, usePartsList, useRegisterStockMovement, useUpdatePart } from '../hooks';
import { Part } from '../types';
import { PartFormDialog, PartFormValues } from './PartFormDialog';
import { StockMovementDialog } from './StockMovementDialog';

const columns: GridColDef<Part>[] = [
  { field: 'code', headerName: 'Código', flex: 1 },
  { field: 'name', headerName: 'Nome', flex: 1 },
  { field: 'quantity', headerName: 'Quantidade', flex: 1 },
  { field: 'minimumQuantity', headerName: 'Mínimo', flex: 1 },
];

export default function PartsPage() {
  const { data: parts = [], isLoading } = usePartsList();
  const createPart = useCreatePart();
  const updatePart = useUpdatePart();
  const registerMovement = useRegisterStockMovement();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Part | undefined>(undefined);
  const [selectedPartId, setSelectedPartId] = useState<string | undefined>(undefined);
  const [movementDirection, setMovementDirection] = useState<'in' | 'out'>('in');
  const [movementOpen, setMovementOpen] = useState(false);

  function handleFormSubmit(values: PartFormValues) {
    const request = editing
      ? updatePart.mutateAsync({ id: editing.id, payload: values })
      : createPart.mutateAsync(values);
    request.then(() => setFormOpen(false));
  }

  function openMovementDialog(direction: 'in' | 'out') {
    const selected = parts[0];
    setSelectedPartId(selected?.id);
    setMovementDirection(direction);
    setMovementOpen(true);
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h4">Peças</Typography>
        <Stack direction="row" spacing={1}>
          <Button onClick={() => openMovementDialog('in')}>Entrada</Button>
          <Button onClick={() => openMovementDialog('out')}>Saída</Button>
          <Button
            variant="contained"
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            Nova Peça
          </Button>
        </Stack>
      </Box>
      <DataGrid
        rows={parts}
        columns={columns}
        loading={isLoading}
        onRowClick={(params) => setSelectedPartId((params.row as Part).id)}
        onRowDoubleClick={(params) => {
          setEditing(params.row as Part);
          setFormOpen(true);
        }}
        autoHeight
      />
      <PartFormDialog
        open={formOpen}
        initialValue={editing}
        onClose={() => setFormOpen(false)}
        onSubmit={handleFormSubmit}
      />
      <StockMovementDialog
        open={movementOpen}
        direction={movementDirection}
        onClose={() => setMovementOpen(false)}
        onConfirm={(quantity) => {
          if (!selectedPartId) return;
          registerMovement
            .mutateAsync({ partId: selectedPartId, direction: movementDirection, quantity })
            .then(() => setMovementOpen(false));
        }}
      />
    </Box>
  );
}
```

- [ ] **Step 5: Wire route and nav entry**

`src/routes.tsx`: add `<Route path="/pecas" element={<PartsPage />} />`.
`src/components/Layout.tsx`: append `{ label: 'Peças', path: '/pecas' }` to `NAV_ITEMS`.

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- PartsPage.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/parts src/routes.tsx src/components/Layout.tsx
git commit -m "feat: add parts/stock CRUD feature with stock movements"
```

---

### Task 9: Purchase Orders feature (list + detail with items, register-purchase, deliver)

**Files:**
- Create: `src/features/purchase-orders/types.ts`
- Create: `src/features/purchase-orders/api.ts`
- Create: `src/features/purchase-orders/hooks.ts`
- Create: `src/features/purchase-orders/pages/PurchaseOrdersPage.tsx`
- Create: `src/features/purchase-orders/pages/PurchaseOrderDetailPage.tsx`
- Modify: `src/routes.tsx` — add `<Route path="/pedidos-compra" element={<PurchaseOrdersPage />} />` and `<Route path="/pedidos-compra/:id" element={<PurchaseOrderDetailPage />} />`
- Modify: `src/components/Layout.tsx` (`NAV_ITEMS`) — add `{ label: 'Pedidos de Compra', path: '/pedidos-compra' }`
- Test: `src/features/purchase-orders/pages/PurchaseOrdersPage.test.tsx`

**Interfaces:**
- Consumes: `apiClient` (Task 2), `usePartsList` (Task 8, for the part picker when adding items).
- Produces: `PurchaseOrderItem { id: string; partId: string; quantity: number; unitPrice: number; subtotal: number }`, `PurchaseOrder { id: string; number: string; supplier: string; status: 'NEEDS_PURCHASE' | 'AWAITING_DELIVERY' | 'DELIVERED'; items: PurchaseOrderItem[]; total: number; createdAt: string; updatedAt: string; deliveredAt: string | null }`, `CreatePurchaseOrderPayload { number: string; supplier: string }`, `AddPurchaseOrderItemPayload { partId: string; quantity: number; unitPrice: number }` (`types.ts`).
- Produces: `usePurchaseOrders()`, `usePurchaseOrder(id: string)`, `useCreatePurchaseOrder()`, `useAddPurchaseOrderItem()`, `useRemovePurchaseOrderItem()`, `useRegisterPurchase()`, `useDeliverPurchaseOrder()` (`hooks.ts`), query key `['purchase-orders']`.

- [ ] **Step 1: Write failing PurchaseOrdersPage test**

`src/features/purchase-orders/pages/PurchaseOrdersPage.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test/server';
import PurchaseOrdersPage from './PurchaseOrdersPage';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PurchaseOrdersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PurchaseOrdersPage', () => {
  it('lista pedidos de compra e cria um novo', async () => {
    server.use(
      http.get('http://localhost:3000/api/v1/purchase-orders', () =>
        HttpResponse.json([
          {
            id: 'po1',
            number: 'PO-001',
            supplier: 'Fornecedor A',
            status: 'NEEDS_PURCHASE',
            items: [],
            total: 0,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            deliveredAt: null,
          },
        ]),
      ),
      http.post('http://localhost:3000/api/v1/purchase-orders', async ({ request }) => {
        const body = (await request.json()) as { number: string; supplier: string };
        return HttpResponse.json(
          {
            id: 'po2',
            number: body.number,
            supplier: body.supplier,
            status: 'NEEDS_PURCHASE',
            items: [],
            total: 0,
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
            deliveredAt: null,
          },
          { status: 201 },
        );
      }),
    );

    renderPage();

    await waitFor(() => expect(screen.getByText('PO-001')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /novo pedido/i }));
    await userEvent.type(screen.getByLabelText(/numero/i), 'PO-002');
    await userEvent.type(screen.getByLabelText(/fornecedor/i), 'Fornecedor B');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => expect(screen.getByText('PO-002')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- PurchaseOrdersPage.test.tsx`
Expected: FAIL — `./PurchaseOrdersPage` does not exist.

- [ ] **Step 3: Implement `types.ts`, `api.ts`, `hooks.ts`**

`src/features/purchase-orders/types.ts`:

```ts
export type PurchaseOrderStatus = 'NEEDS_PURCHASE' | 'AWAITING_DELIVERY' | 'DELIVERED';

export interface PurchaseOrderItem {
  id: string;
  partId: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface PurchaseOrder {
  id: string;
  number: string;
  supplier: string;
  status: PurchaseOrderStatus;
  items: PurchaseOrderItem[];
  total: number;
  createdAt: string;
  updatedAt: string;
  deliveredAt: string | null;
}

export interface CreatePurchaseOrderPayload {
  number: string;
  supplier: string;
}

export interface AddPurchaseOrderItemPayload {
  partId: string;
  quantity: number;
  unitPrice: number;
}
```

`src/features/purchase-orders/api.ts`:

```ts
import apiClient from '../../lib/apiClient';
import {
  AddPurchaseOrderItemPayload,
  CreatePurchaseOrderPayload,
  PurchaseOrder,
} from './types';

export async function listPurchaseOrders(): Promise<PurchaseOrder[]> {
  const { data } = await apiClient.get<PurchaseOrder[]>('/purchase-orders');
  return data;
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrder> {
  const { data } = await apiClient.get<PurchaseOrder>(`/purchase-orders/${id}`);
  return data;
}

export async function createPurchaseOrder(
  payload: CreatePurchaseOrderPayload,
): Promise<PurchaseOrder> {
  const { data } = await apiClient.post<PurchaseOrder>('/purchase-orders', payload);
  return data;
}

export async function addPurchaseOrderItem(
  id: string,
  payload: AddPurchaseOrderItemPayload,
): Promise<PurchaseOrder> {
  const { data } = await apiClient.post<PurchaseOrder>(
    `/purchase-orders/${id}/items`,
    payload,
  );
  return data;
}

export async function removePurchaseOrderItem(
  id: string,
  itemId: string,
): Promise<PurchaseOrder> {
  const { data } = await apiClient.delete<PurchaseOrder>(
    `/purchase-orders/${id}/items/${itemId}`,
  );
  return data;
}

export async function registerPurchase(id: string): Promise<PurchaseOrder> {
  const { data } = await apiClient.patch<PurchaseOrder>(
    `/purchase-orders/${id}/register-purchase`,
  );
  return data;
}

export async function deliverPurchaseOrder(id: string): Promise<PurchaseOrder> {
  const { data } = await apiClient.patch<PurchaseOrder>(
    `/purchase-orders/${id}/deliver`,
  );
  return data;
}
```

`src/features/purchase-orders/hooks.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as purchaseOrdersApi from './api';
import { AddPurchaseOrderItemPayload, CreatePurchaseOrderPayload } from './types';

const PURCHASE_ORDERS_KEY = ['purchase-orders'];

export function usePurchaseOrders() {
  return useQuery({
    queryKey: PURCHASE_ORDERS_KEY,
    queryFn: purchaseOrdersApi.listPurchaseOrders,
  });
}

export function usePurchaseOrder(id: string) {
  return useQuery({
    queryKey: [...PURCHASE_ORDERS_KEY, id],
    queryFn: () => purchaseOrdersApi.getPurchaseOrder(id),
    enabled: Boolean(id),
  });
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePurchaseOrderPayload) =>
      purchaseOrdersApi.createPurchaseOrder(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PURCHASE_ORDERS_KEY }),
  });
}

export function useAddPurchaseOrderItem(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AddPurchaseOrderItemPayload) =>
      purchaseOrdersApi.addPurchaseOrderItem(id, payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [...PURCHASE_ORDERS_KEY, id] }),
  });
}

export function useRemovePurchaseOrderItem(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => purchaseOrdersApi.removePurchaseOrderItem(id, itemId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [...PURCHASE_ORDERS_KEY, id] }),
  });
}

export function useRegisterPurchase(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => purchaseOrdersApi.registerPurchase(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [...PURCHASE_ORDERS_KEY, id] }),
  });
}

export function useDeliverPurchaseOrder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => purchaseOrdersApi.deliverPurchaseOrder(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [...PURCHASE_ORDERS_KEY, id] }),
  });
}
```

- [ ] **Step 4: Implement `PurchaseOrdersPage.tsx` and `PurchaseOrderDetailPage.tsx`**

`src/features/purchase-orders/pages/PurchaseOrdersPage.tsx`:

```tsx
import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { useCreatePurchaseOrder, usePurchaseOrders } from '../hooks';
import { PurchaseOrder } from '../types';

const schema = z.object({
  number: z.string().min(1, 'Número obrigatório'),
  supplier: z.string().min(1, 'Fornecedor obrigatório'),
});
type FormValues = z.infer<typeof schema>;

const columns: GridColDef<PurchaseOrder>[] = [
  { field: 'number', headerName: 'Número', flex: 1 },
  { field: 'supplier', headerName: 'Fornecedor', flex: 1 },
  { field: 'status', headerName: 'Status', flex: 1 },
  { field: 'total', headerName: 'Total', flex: 1 },
];

export default function PurchaseOrdersPage() {
  const { data: orders = [], isLoading } = usePurchaseOrders();
  const createOrder = useCreatePurchaseOrder();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { number: '', supplier: '' },
  });

  function onSubmit(values: FormValues) {
    createOrder.mutateAsync(values).then(() => {
      reset();
      setDialogOpen(false);
    });
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h4">Pedidos de Compra</Typography>
        <Button variant="contained" onClick={() => setDialogOpen(true)}>
          Novo Pedido
        </Button>
      </Box>
      <DataGrid
        rows={orders}
        columns={columns}
        loading={isLoading}
        onRowClick={(params) => navigate(`/pedidos-compra/${params.row.id}`)}
        autoHeight
      />
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Novo Pedido de Compra</DialogTitle>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Número"
              {...register('number')}
              error={!!errors.number}
              helperText={errors.number?.message}
            />
            <TextField
              label="Fornecedor"
              {...register('supplier')}
              error={!!errors.supplier}
              helperText={errors.supplier?.message}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="contained">
              Salvar
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
}
```

`src/features/purchase-orders/pages/PurchaseOrderDetailPage.tsx`:

```tsx
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Autocomplete,
  Box,
  Button,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { usePartsList } from '../../parts/hooks';
import {
  useAddPurchaseOrderItem,
  useDeliverPurchaseOrder,
  usePurchaseOrder,
  useRegisterPurchase,
  useRemovePurchaseOrderItem,
} from '../hooks';
import { PurchaseOrderItem } from '../types';

const itemColumns: GridColDef<PurchaseOrderItem>[] = [
  { field: 'partId', headerName: 'Peça', flex: 1 },
  { field: 'quantity', headerName: 'Quantidade', flex: 1 },
  { field: 'unitPrice', headerName: 'Preço unitário', flex: 1 },
  { field: 'subtotal', headerName: 'Subtotal', flex: 1 },
];

export default function PurchaseOrderDetailPage() {
  const { id = '' } = useParams();
  const { data: order } = usePurchaseOrder(id);
  const { data: parts = [] } = usePartsList();
  const addItem = useAddPurchaseOrderItem(id);
  const removeItem = useRemovePurchaseOrderItem(id);
  const registerPurchase = useRegisterPurchase(id);
  const deliver = useDeliverPurchaseOrder(id);

  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');

  if (!order) return null;

  return (
    <Box>
      <Typography variant="h4" mb={2}>
        Pedido {order.number} — {order.status}
      </Typography>

      <DataGrid
        rows={order.items}
        columns={itemColumns}
        autoHeight
        onRowDoubleClick={(params) => removeItem.mutate((params.row as PurchaseOrderItem).id)}
      />

      {order.status === 'NEEDS_PURCHASE' && (
        <Stack direction="row" spacing={2} mt={2} alignItems="center">
          <Autocomplete
            sx={{ width: 240 }}
            options={parts}
            getOptionLabel={(part) => part.name}
            onChange={(_, value) => setSelectedPartId(value?.id ?? null)}
            renderInput={(params) => <TextField {...params} label="Peça" />}
          />
          <TextField
            label="Quantidade"
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          <TextField
            label="Preço unitário"
            type="number"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
          />
          <Button
            variant="contained"
            disabled={!selectedPartId}
            onClick={() =>
              addItem.mutate({
                partId: selectedPartId!,
                quantity: Number(quantity),
                unitPrice: Number(unitPrice),
              })
            }
          >
            Adicionar item
          </Button>
        </Stack>
      )}

      <Stack direction="row" spacing={2} mt={3}>
        {order.status === 'NEEDS_PURCHASE' && (
          <Button variant="outlined" onClick={() => registerPurchase.mutate()}>
            Registrar compra
          </Button>
        )}
        {order.status === 'AWAITING_DELIVERY' && (
          <Button variant="outlined" onClick={() => deliver.mutate()}>
            Registrar entrega
          </Button>
        )}
      </Stack>
    </Box>
  );
}
```

- [ ] **Step 5: Wire routes and nav entry**

`src/routes.tsx`: add `<Route path="/pedidos-compra" element={<PurchaseOrdersPage />} />` and `<Route path="/pedidos-compra/:id" element={<PurchaseOrderDetailPage />} />`.
`src/components/Layout.tsx`: append `{ label: 'Pedidos de Compra', path: '/pedidos-compra' }` to `NAV_ITEMS`.

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- PurchaseOrdersPage.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/purchase-orders src/routes.tsx src/components/Layout.tsx
git commit -m "feat: add purchase orders feature with items and delivery flow"
```

---

### Task 10: Service Orders feature (list + create + detail hub with status actions)

Establishes the OS detail page as a single-tab `MUI Tabs` shell (`TABS` array + switch on `activeTab`) that Tasks 11–13 each extend by adding one more tab — no empty/placeholder tabs are introduced now, only the one real "Detalhes" tab.

**Files:**
- Create: `src/features/service-orders/types.ts`
- Create: `src/features/service-orders/statusTransitions.ts`
- Create: `src/features/service-orders/api.ts`
- Create: `src/features/service-orders/hooks.ts`
- Create: `src/features/service-orders/pages/ServiceOrdersPage.tsx`
- Create: `src/features/service-orders/pages/ServiceOrderDetailPage.tsx`
- Create: `src/features/service-orders/components/ServiceOrderDetailsTab.tsx`
- Create: `src/features/service-orders/components/AssignMechanicDialog.tsx`
- Create: `src/features/service-orders/components/CancelOrderDialog.tsx`
- Create: `src/components/StatusChip.tsx`
- Modify: `src/routes.tsx` — add `<Route path="/ordens-servico" element={<ServiceOrdersPage />} />` and `<Route path="/ordens-servico/:id" element={<ServiceOrderDetailPage />} />`
- Modify: `src/components/Layout.tsx` (`NAV_ITEMS`) — add `{ label: 'Ordens de Serviço', path: '/ordens-servico' }`
- Test: `src/features/service-orders/pages/ServiceOrdersPage.test.tsx`
- Test: `src/features/service-orders/pages/ServiceOrderDetailPage.test.tsx`

**Interfaces:**
- Consumes: `apiClient` (Task 2), `useClients` (Task 5), `useVehicles` (Task 6).
- Produces: `ServiceOrderStatus = 'RECEIVED' | 'IN_DIAGNOSIS' | 'AWAITING_APPROVAL' | 'AWAITING_PARTS' | 'IN_PROGRESS' | 'COMPLETED' | 'DELIVERED' | 'CANCELLED'`, `ServiceOrder { id: string; clientId: string; vehicleId: string; description: string; status: ServiceOrderStatus; cancellationReason: string | null; mechanicId: string | null; assignedAt: string | null; partsDispatchedAt: string | null; completedAt: string | null; executionTimeMs: number | null; createdAt: string; updatedAt: string }` (`types.ts`).
- Produces: `ALLOWED_TRANSITIONS: Record<ServiceOrderStatus, ServiceOrderStatus[]>` (`statusTransitions.ts`) — the exact table in Global Constraints, used by later tasks too.
- Produces: `useServiceOrders()`, `useServiceOrder(id: string)`, `useCreateServiceOrder()`, `useAssignMechanic(id: string)`, `useCompleteServiceOrder(id: string)`, `useCancelServiceOrder(id: string)` (`hooks.ts`), query key `['service-orders']`.
- Produces: `StatusChip` (`src/components/StatusChip.tsx`) — `{ status: string }`, generic colored `Chip`, reused by budgets/billing/purchase-orders tasks for their own status enums.
- Produces: `TABS` array and `activeTab` state in `ServiceOrderDetailPage.tsx` — Task 11 appends a `{ label: 'Orçamento', render: (order) => <BudgetTab .../> }` entry, Task 12 and 13 do the same for Peças/Faturamento.

- [ ] **Step 1: Write failing ServiceOrdersPage test**

`src/features/service-orders/pages/ServiceOrdersPage.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test/server';
import ServiceOrdersPage from './ServiceOrdersPage';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ServiceOrdersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const baseOrder = {
  id: 'os1',
  clientId: 'c1',
  vehicleId: 'v1',
  description: 'Barulho no motor',
  status: 'RECEIVED',
  cancellationReason: null,
  mechanicId: null,
  assignedAt: null,
  partsDispatchedAt: null,
  completedAt: null,
  executionTimeMs: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('ServiceOrdersPage', () => {
  it('lista ordens de servico e abre uma nova', async () => {
    server.use(
      http.get('http://localhost:3000/api/v1/service-orders', () =>
        HttpResponse.json([baseOrder]),
      ),
      http.get('http://localhost:3000/api/v1/clients', () =>
        HttpResponse.json([
          { id: 'c1', name: 'Maria Souza', document: '1', email: 'm@x.com', phone: '1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
        ]),
      ),
      http.get('http://localhost:3000/api/v1/vehicles', () =>
        HttpResponse.json([
          { id: 'v1', clientId: 'c1', plate: 'ABC1234', brand: 'Fiat', model: 'Uno', year: 2015, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
        ]),
      ),
      http.post('http://localhost:3000/api/v1/service-orders', async ({ request }) => {
        const body = (await request.json()) as { description: string };
        return HttpResponse.json(
          { ...baseOrder, id: 'os2', description: body.description },
          { status: 201 },
        );
      }),
    );

    renderPage();

    await waitFor(() => expect(screen.getByText('Barulho no motor')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /nova ordem/i }));
    await userEvent.click(screen.getByLabelText(/cliente/i));
    await userEvent.click(await screen.findByText('Maria Souza'));
    await userEvent.click(screen.getByLabelText(/veiculo/i));
    await userEvent.click(await screen.findByText('ABC1234'));
    await userEvent.type(screen.getByLabelText(/descricao/i), 'Troca de pastilhas');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => expect(screen.getByText('Troca de pastilhas')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ServiceOrdersPage.test.tsx`
Expected: FAIL — `./ServiceOrdersPage` does not exist.

- [ ] **Step 3: Implement `types.ts`, `statusTransitions.ts`, `api.ts`, `hooks.ts`, `StatusChip.tsx`**

`src/features/service-orders/types.ts`:

```ts
export type ServiceOrderStatus =
  | 'RECEIVED'
  | 'IN_DIAGNOSIS'
  | 'AWAITING_APPROVAL'
  | 'AWAITING_PARTS'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'DELIVERED'
  | 'CANCELLED';

export interface ServiceOrder {
  id: string;
  clientId: string;
  vehicleId: string;
  description: string;
  status: ServiceOrderStatus;
  cancellationReason: string | null;
  mechanicId: string | null;
  assignedAt: string | null;
  partsDispatchedAt: string | null;
  completedAt: string | null;
  executionTimeMs: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateServiceOrderPayload {
  clientId: string;
  vehicleId: string;
  description: string;
}
```

`src/features/service-orders/statusTransitions.ts`:

```ts
import { ServiceOrderStatus } from './types';

export const ALLOWED_TRANSITIONS: Record<ServiceOrderStatus, ServiceOrderStatus[]> = {
  RECEIVED: ['IN_DIAGNOSIS', 'CANCELLED'],
  IN_DIAGNOSIS: ['AWAITING_APPROVAL', 'CANCELLED'],
  AWAITING_APPROVAL: ['AWAITING_PARTS', 'IN_PROGRESS', 'CANCELLED'],
  AWAITING_PARTS: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};
```

`src/features/service-orders/api.ts`:

```ts
import apiClient from '../../lib/apiClient';
import { CreateServiceOrderPayload, ServiceOrder } from './types';

export async function listServiceOrders(): Promise<ServiceOrder[]> {
  const { data } = await apiClient.get<ServiceOrder[]>('/service-orders');
  return data;
}

export async function getServiceOrder(id: string): Promise<ServiceOrder> {
  const { data } = await apiClient.get<ServiceOrder>(`/service-orders/${id}`);
  return data;
}

export async function createServiceOrder(
  payload: CreateServiceOrderPayload,
): Promise<ServiceOrder> {
  const { data } = await apiClient.post<ServiceOrder>('/service-orders', payload);
  return data;
}

export async function assignMechanic(
  id: string,
  mechanicId: string,
): Promise<ServiceOrder> {
  const { data } = await apiClient.patch<ServiceOrder>(
    `/service-orders/${id}/assign`,
    { mechanicId },
  );
  return data;
}

export async function completeServiceOrder(id: string): Promise<ServiceOrder> {
  const { data } = await apiClient.patch<ServiceOrder>(
    `/service-orders/${id}/complete`,
  );
  return data;
}

export async function cancelServiceOrder(
  id: string,
  reason: string,
): Promise<ServiceOrder> {
  const { data } = await apiClient.patch<ServiceOrder>(
    `/service-orders/${id}/cancel`,
    { reason },
  );
  return data;
}
```

`src/features/service-orders/hooks.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as serviceOrdersApi from './api';
import { CreateServiceOrderPayload } from './types';

const SERVICE_ORDERS_KEY = ['service-orders'];

export function useServiceOrders() {
  return useQuery({
    queryKey: SERVICE_ORDERS_KEY,
    queryFn: serviceOrdersApi.listServiceOrders,
  });
}

export function useServiceOrder(id: string) {
  return useQuery({
    queryKey: [...SERVICE_ORDERS_KEY, id],
    queryFn: () => serviceOrdersApi.getServiceOrder(id),
    enabled: Boolean(id),
  });
}

export function useCreateServiceOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateServiceOrderPayload) =>
      serviceOrdersApi.createServiceOrder(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SERVICE_ORDERS_KEY }),
  });
}

function invalidateOrder(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  return queryClient.invalidateQueries({ queryKey: [...SERVICE_ORDERS_KEY, id] });
}

export function useAssignMechanic(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mechanicId: string) => serviceOrdersApi.assignMechanic(id, mechanicId),
    onSuccess: () => invalidateOrder(queryClient, id),
  });
}

export function useCompleteServiceOrder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => serviceOrdersApi.completeServiceOrder(id),
    onSuccess: () => invalidateOrder(queryClient, id),
  });
}

export function useCancelServiceOrder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => serviceOrdersApi.cancelServiceOrder(id, reason),
    onSuccess: () => invalidateOrder(queryClient, id),
  });
}
```

`src/components/StatusChip.tsx`:

```tsx
import { Chip } from '@mui/material';

const COLOR_BY_STATUS: Record<string, 'default' | 'info' | 'warning' | 'success' | 'error'> = {
  RECEIVED: 'default',
  IN_DIAGNOSIS: 'info',
  AWAITING_APPROVAL: 'warning',
  AWAITING_PARTS: 'warning',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  DELIVERED: 'success',
  CANCELLED: 'error',
  GENERATED: 'default',
  WAITING_APPROVAL: 'warning',
  ACCEPTED: 'success',
  REFUSED: 'error',
  PENDING: 'default',
  WAITING_PAYMENT: 'warning',
  PAID: 'success',
  EXPIRED: 'error',
  NEEDS_PURCHASE: 'warning',
  AWAITING_DELIVERY: 'info',
};

export function StatusChip({ status }: { status: string }) {
  return <Chip label={status} color={COLOR_BY_STATUS[status] ?? 'default'} size="small" />;
}
```

- [ ] **Step 4: Run test to verify it fails still (form pieces missing)**

Run: `npm test -- ServiceOrdersPage.test.tsx`
Expected: FAIL — `./ServiceOrdersPage` still does not exist.

- [ ] **Step 5: Implement `ServiceOrdersPage.tsx`**

```tsx
import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import {
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { StatusChip } from '../../../components/StatusChip';
import { useClients } from '../../clients/hooks';
import { useVehicles } from '../../vehicles/hooks';
import { useCreateServiceOrder, useServiceOrders } from '../hooks';
import { ServiceOrder } from '../types';

const schema = z.object({
  clientId: z.string().min(1, 'Cliente obrigatório'),
  vehicleId: z.string().min(1, 'Veículo obrigatório'),
  description: z.string().min(1, 'Descrição obrigatória'),
});
type FormValues = z.infer<typeof schema>;

const columns: GridColDef<ServiceOrder>[] = [
  { field: 'description', headerName: 'Descrição', flex: 1 },
  {
    field: 'status',
    headerName: 'Status',
    flex: 1,
    renderCell: (params) => <StatusChip status={params.row.status} />,
  },
];

export default function ServiceOrdersPage() {
  const { data: orders = [], isLoading } = useServiceOrders();
  const { data: clients = [] } = useClients();
  const createOrder = useCreateServiceOrder();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const {
    control,
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { clientId: '', vehicleId: '', description: '' },
  });
  const selectedClientId = watch('clientId');
  const { data: vehicles = [] } = useVehicles(selectedClientId || undefined);

  function onSubmit(values: FormValues) {
    createOrder.mutateAsync(values).then(() => {
      reset();
      setDialogOpen(false);
    });
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h4">Ordens de Serviço</Typography>
        <Button variant="contained" onClick={() => setDialogOpen(true)}>
          Nova Ordem
        </Button>
      </Box>
      <DataGrid
        rows={orders}
        columns={columns}
        loading={isLoading}
        onRowClick={(params) => navigate(`/ordens-servico/${params.row.id}`)}
        autoHeight
      />
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nova Ordem de Serviço</DialogTitle>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Controller
              name="clientId"
              control={control}
              render={({ field }) => (
                <Autocomplete
                  options={clients}
                  getOptionLabel={(option) => option.name}
                  onChange={(_, value) => field.onChange(value?.id ?? '')}
                  renderInput={(params) => (
                    <TextField {...params} label="Cliente" error={!!errors.clientId} helperText={errors.clientId?.message} />
                  )}
                />
              )}
            />
            <Controller
              name="vehicleId"
              control={control}
              render={({ field }) => (
                <Autocomplete
                  options={vehicles}
                  getOptionLabel={(option) => option.plate}
                  onChange={(_, value) => field.onChange(value?.id ?? '')}
                  renderInput={(params) => (
                    <TextField {...params} label="Veículo" error={!!errors.vehicleId} helperText={errors.vehicleId?.message} />
                  )}
                />
              )}
            />
            <TextField
              label="Descrição"
              multiline
              rows={3}
              {...register('description')}
              error={!!errors.description}
              helperText={errors.description?.message}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="contained">
              Salvar
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- ServiceOrdersPage.test.tsx`
Expected: PASS

- [ ] **Step 7: Write failing ServiceOrderDetailPage test**

`src/features/service-orders/pages/ServiceOrderDetailPage.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test/server';
import ServiceOrderDetailPage from './ServiceOrderDetailPage';

function renderPage(order: Record<string, unknown>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  server.use(
    http.get('http://localhost:3000/api/v1/service-orders/os1', () =>
      HttpResponse.json(order),
    ),
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/ordens-servico/os1']}>
        <Routes>
          <Route path="/ordens-servico/:id" element={<ServiceOrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const receivedOrder = {
  id: 'os1',
  clientId: 'c1',
  vehicleId: 'v1',
  description: 'Barulho no motor',
  status: 'RECEIVED',
  cancellationReason: null,
  mechanicId: null,
  assignedAt: null,
  partsDispatchedAt: null,
  completedAt: null,
  executionTimeMs: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('ServiceOrderDetailPage', () => {
  it('atribui mecanico e avanca a OS para IN_DIAGNOSIS', async () => {
    server.use(
      http.patch('http://localhost:3000/api/v1/service-orders/os1/assign', () =>
        HttpResponse.json({ ...receivedOrder, status: 'IN_DIAGNOSIS', mechanicId: 'mec-1' }),
      ),
    );
    renderPage(receivedOrder);

    await waitFor(() => expect(screen.getByText('Barulho no motor')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /atribuir mecanico/i }));
    await userEvent.type(screen.getByLabelText(/mecanico/i), 'mec-1');
    await userEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    await waitFor(() => expect(screen.getByText('IN_DIAGNOSIS')).toBeInTheDocument());
  });

  it('desabilita finalizar quando status nao permite', async () => {
    renderPage(receivedOrder);

    await waitFor(() => expect(screen.getByText('Barulho no motor')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /finalizar/i })).toBeDisabled();
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

Run: `npm test -- ServiceOrderDetailPage.test.tsx`
Expected: FAIL — `./ServiceOrderDetailPage` does not exist.

- [ ] **Step 9: Implement `AssignMechanicDialog.tsx`, `CancelOrderDialog.tsx`, `ServiceOrderDetailsTab.tsx`, `ServiceOrderDetailPage.tsx`**

`src/features/service-orders/components/AssignMechanicDialog.tsx`:

```tsx
import { useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';

export function AssignMechanicDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (mechanicId: string) => void;
}) {
  const [mechanicId, setMechanicId] = useState('');

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Atribuir mecânico</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          label="Mecânico"
          fullWidth
          margin="normal"
          value={mechanicId}
          onChange={(e) => setMechanicId(e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button
          variant="contained"
          disabled={!mechanicId}
          onClick={() => {
            onConfirm(mechanicId);
            setMechanicId('');
          }}
        >
          Confirmar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

`src/features/service-orders/components/CancelOrderDialog.tsx`:

```tsx
import { useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';

export function CancelOrderDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Cancelar ordem de serviço</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          label="Motivo"
          fullWidth
          margin="normal"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Voltar</Button>
        <Button
          color="error"
          variant="contained"
          disabled={!reason}
          onClick={() => {
            onConfirm(reason);
            setReason('');
          }}
        >
          Confirmar cancelamento
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

`src/features/service-orders/components/ServiceOrderDetailsTab.tsx`:

```tsx
import { useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { StatusChip } from '../../../components/StatusChip';
import {
  useAssignMechanic,
  useCancelServiceOrder,
  useCompleteServiceOrder,
} from '../hooks';
import { ALLOWED_TRANSITIONS } from '../statusTransitions';
import { ServiceOrder } from '../types';
import { AssignMechanicDialog } from './AssignMechanicDialog';
import { CancelOrderDialog } from './CancelOrderDialog';

export function ServiceOrderDetailsTab({ order }: { order: ServiceOrder }) {
  const assignMechanic = useAssignMechanic(order.id);
  const completeOrder = useCompleteServiceOrder(order.id);
  const cancelOrder = useCancelServiceOrder(order.id);
  const [assignOpen, setAssignOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const allowed = ALLOWED_TRANSITIONS[order.status];
  const canAssign = order.status === 'RECEIVED';
  const canComplete = allowed.includes('COMPLETED');
  const canCancel = allowed.includes('CANCELLED');

  return (
    <Box>
      <Stack direction="row" spacing={2} alignItems="center" mb={2}>
        <StatusChip status={order.status} />
        <Typography variant="body1">{order.description}</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" mb={2}>
        Mecânico: {order.mechanicId ?? 'não atribuído'}
      </Typography>
      <Stack direction="row" spacing={2}>
        <Button variant="outlined" disabled={!canAssign} onClick={() => setAssignOpen(true)}>
          Atribuir Mecânico
        </Button>
        <Button
          variant="outlined"
          disabled={!canComplete}
          onClick={() => completeOrder.mutate()}
        >
          Finalizar
        </Button>
        <Button
          color="error"
          variant="outlined"
          disabled={!canCancel}
          onClick={() => setCancelOpen(true)}
        >
          Cancelar
        </Button>
      </Stack>
      <AssignMechanicDialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        onConfirm={(mechanicId) => {
          assignMechanic.mutate(mechanicId);
          setAssignOpen(false);
        }}
      />
      <CancelOrderDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={(reason) => {
          cancelOrder.mutate(reason);
          setCancelOpen(false);
        }}
      />
    </Box>
  );
}
```

`src/features/service-orders/pages/ServiceOrderDetailPage.tsx`:

```tsx
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Tab, Tabs, Typography } from '@mui/material';
import { useServiceOrder } from '../hooks';
import { ServiceOrder } from '../types';
import { ServiceOrderDetailsTab } from '../components/ServiceOrderDetailsTab';

interface TabEntry {
  label: string;
  render: (order: ServiceOrder) => React.ReactNode;
}

export const TABS: TabEntry[] = [
  { label: 'Detalhes', render: (order) => <ServiceOrderDetailsTab order={order} /> },
];

export default function ServiceOrderDetailPage() {
  const { id = '' } = useParams();
  const { data: order } = useServiceOrder(id);
  const [activeTab, setActiveTab] = useState(0);

  if (!order) return null;

  return (
    <Box>
      <Typography variant="h4" mb={2}>
        Ordem de Serviço — {order.description}
      </Typography>
      <Tabs value={activeTab} onChange={(_, value) => setActiveTab(value)}>
        {TABS.map((tab) => (
          <Tab key={tab.label} label={tab.label} />
        ))}
      </Tabs>
      <Box mt={2}>{TABS[activeTab].render(order)}</Box>
    </Box>
  );
}
```

- [ ] **Step 10: Run test to verify it passes**

Run: `npm test -- ServiceOrderDetailPage.test.tsx`
Expected: PASS

- [ ] **Step 11: Wire routes and nav entry**

`src/routes.tsx`: add `<Route path="/ordens-servico" element={<ServiceOrdersPage />} />` and `<Route path="/ordens-servico/:id" element={<ServiceOrderDetailPage />} />`.
`src/components/Layout.tsx`: append `{ label: 'Ordens de Serviço', path: '/ordens-servico' }` to `NAV_ITEMS`.

- [ ] **Step 12: Run full test suite**

Run: `npm test`
Expected: PASS (all suites)

- [ ] **Step 13: Commit**

```bash
git add src/features/service-orders src/components/StatusChip.tsx src/routes.tsx src/components/Layout.tsx
git commit -m "feat: add service orders feature with status-driven detail hub"
```

---

### Task 11: Budgets feature (Orçamento tab in OS detail)

**Files:**
- Create: `src/features/budgets/types.ts`
- Create: `src/features/budgets/api.ts`
- Create: `src/features/budgets/hooks.ts`
- Create: `src/features/budgets/components/BudgetTab.tsx`
- Create: `src/features/budgets/components/BudgetItemFormDialog.tsx`
- Modify: `src/features/service-orders/pages/ServiceOrderDetailPage.tsx` — append to `TABS`: `{ label: 'Orçamento', render: (order) => <BudgetTab serviceOrderId={order.id} /> }`
- Test: `src/features/budgets/components/BudgetTab.test.tsx`

**Interfaces:**
- Consumes: `apiClient` (Task 2), `usePartsList` (Task 8), `useServiceCatalog` (Task 7), `TABS`/`ServiceOrderDetailPage.tsx` (Task 10).
- Produces: `BudgetItemType = 'SERVICE' | 'PART'`, `BudgetStatus = 'GENERATED' | 'WAITING_APPROVAL' | 'ACCEPTED' | 'REFUSED'`, `BudgetItem { id: string; partId: string | null; serviceId: string | null; description: string; type: BudgetItemType; quantity: number; unitPrice: number; subtotal: number }`, `Budget { id: string; serviceOrderId: string; version: number; status: BudgetStatus; totalAmount: number; refusalReason: string | null; sentAt: string | null; answeredAt: string | null; createdAt: string; updatedAt: string; items: BudgetItem[] }`, `CreateBudgetItemPayload { partId?: string; serviceId?: string; description: string; type: BudgetItemType; quantity: number; unitPrice: number }` (`types.ts`).
- Produces: `useBudgetsByServiceOrder(serviceOrderId: string)`, `useCreateBudget()`, `useAddBudgetItem(budgetId: string)`, `useRemoveBudgetItem(budgetId: string)`, `useSendBudget(budgetId: string)`, `useAcceptBudget(budgetId: string)`, `useRefuseBudget(budgetId: string)` (`hooks.ts`), query key `['budgets', 'service-order', serviceOrderId]`.
- Produces: `BudgetTab` (`{ serviceOrderId: string }`) — the tab content plugged into `ServiceOrderDetailPage`'s `TABS`.

- [ ] **Step 1: Write failing BudgetTab test**

`src/features/budgets/components/BudgetTab.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test/server';
import { BudgetTab } from './BudgetTab';

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BudgetTab serviceOrderId="os1" />
    </QueryClientProvider>,
  );
}

describe('BudgetTab', () => {
  it('cria orcamento quando nao existe nenhum para a OS', async () => {
    server.use(
      http.get('http://localhost:3000/api/v1/budgets/service-orders/os1', () =>
        HttpResponse.json([]),
      ),
      http.get('http://localhost:3000/api/v1/services', () => HttpResponse.json([])),
      http.get('http://localhost:3000/api/v1/parts', () => HttpResponse.json([])),
      http.post('http://localhost:3000/api/v1/budgets', async ({ request }) => {
        const body = (await request.json()) as {
          serviceOrderId: string;
          items: Array<{ description: string; unitPrice: number; quantity: number; type: string }>;
        };
        const item = body.items[0];
        return HttpResponse.json(
          {
            id: 'b1',
            serviceOrderId: body.serviceOrderId,
            version: 1,
            status: 'GENERATED',
            totalAmount: item.unitPrice * item.quantity,
            refusalReason: null,
            sentAt: null,
            answeredAt: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            items: [{ id: 'i1', partId: null, serviceId: null, ...item, subtotal: item.unitPrice * item.quantity }],
          },
          { status: 201 },
        );
      }),
    );

    renderTab();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /criar orcamento/i })).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole('button', { name: /criar orcamento/i }));
    await userEvent.type(screen.getByLabelText(/descricao/i), 'Troca de óleo');
    await userEvent.type(screen.getByLabelText(/quantidade/i), '1');
    await userEvent.type(screen.getByLabelText(/preco/i), '150');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => expect(screen.getByText('GENERATED')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- BudgetTab.test.tsx`
Expected: FAIL — `./BudgetTab` does not exist.

- [ ] **Step 3: Implement `types.ts`, `api.ts`, `hooks.ts`**

`src/features/budgets/types.ts`:

```ts
export type BudgetItemType = 'SERVICE' | 'PART';
export type BudgetStatus = 'GENERATED' | 'WAITING_APPROVAL' | 'ACCEPTED' | 'REFUSED';

export interface BudgetItem {
  id: string;
  partId: string | null;
  serviceId: string | null;
  description: string;
  type: BudgetItemType;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface Budget {
  id: string;
  serviceOrderId: string;
  version: number;
  status: BudgetStatus;
  totalAmount: number;
  refusalReason: string | null;
  sentAt: string | null;
  answeredAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: BudgetItem[];
}

export interface CreateBudgetItemPayload {
  partId?: string;
  serviceId?: string;
  description: string;
  type: BudgetItemType;
  quantity: number;
  unitPrice: number;
}
```

`src/features/budgets/api.ts`:

```ts
import apiClient from '../../lib/apiClient';
import { Budget, CreateBudgetItemPayload } from './types';

export async function listBudgetsByServiceOrder(serviceOrderId: string): Promise<Budget[]> {
  const { data } = await apiClient.get<Budget[]>(
    `/budgets/service-orders/${serviceOrderId}`,
  );
  return data;
}

export async function createBudget(
  serviceOrderId: string,
  items: CreateBudgetItemPayload[],
): Promise<Budget> {
  const { data } = await apiClient.post<Budget>('/budgets', { serviceOrderId, items });
  return data;
}

export async function addBudgetItem(
  budgetId: string,
  item: CreateBudgetItemPayload,
): Promise<Budget> {
  const { data } = await apiClient.post<Budget>(`/budgets/${budgetId}/items`, item);
  return data;
}

export async function removeBudgetItem(budgetId: string, itemId: string): Promise<Budget> {
  const { data } = await apiClient.delete<Budget>(`/budgets/${budgetId}/items/${itemId}`);
  return data;
}

export async function sendBudget(budgetId: string): Promise<Budget> {
  const { data } = await apiClient.post<Budget>(`/budgets/${budgetId}/send`);
  return data;
}

export async function acceptBudget(budgetId: string): Promise<Budget> {
  const { data } = await apiClient.post<Budget>(`/budgets/${budgetId}/accept`);
  return data;
}

export async function refuseBudget(budgetId: string, reason: string): Promise<Budget> {
  const { data } = await apiClient.post<Budget>(`/budgets/${budgetId}/refuse`, { reason });
  return data;
}
```

`src/features/budgets/hooks.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as budgetsApi from './api';
import { CreateBudgetItemPayload } from './types';

function budgetsKey(serviceOrderId: string) {
  return ['budgets', 'service-order', serviceOrderId];
}

export function useBudgetsByServiceOrder(serviceOrderId: string) {
  return useQuery({
    queryKey: budgetsKey(serviceOrderId),
    queryFn: () => budgetsApi.listBudgetsByServiceOrder(serviceOrderId),
    enabled: Boolean(serviceOrderId),
  });
}

export function useCreateBudget(serviceOrderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: CreateBudgetItemPayload[]) =>
      budgetsApi.createBudget(serviceOrderId, items),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: budgetsKey(serviceOrderId) }),
  });
}

export function useAddBudgetItem(serviceOrderId: string, budgetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: CreateBudgetItemPayload) => budgetsApi.addBudgetItem(budgetId, item),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: budgetsKey(serviceOrderId) }),
  });
}

export function useRemoveBudgetItem(serviceOrderId: string, budgetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => budgetsApi.removeBudgetItem(budgetId, itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: budgetsKey(serviceOrderId) }),
  });
}

export function useSendBudget(serviceOrderId: string, budgetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => budgetsApi.sendBudget(budgetId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: budgetsKey(serviceOrderId) }),
  });
}

export function useAcceptBudget(serviceOrderId: string, budgetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => budgetsApi.acceptBudget(budgetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetsKey(serviceOrderId) });
      queryClient.invalidateQueries({ queryKey: ['service-orders', serviceOrderId] });
    },
  });
}

export function useRefuseBudget(serviceOrderId: string, budgetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => budgetsApi.refuseBudget(budgetId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetsKey(serviceOrderId) });
      queryClient.invalidateQueries({ queryKey: ['service-orders', serviceOrderId] });
    },
  });
}
```

- [ ] **Step 4: Implement `BudgetItemFormDialog.tsx` and `BudgetTab.tsx`**

`src/features/budgets/components/BudgetItemFormDialog.tsx`:

```tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
} from '@mui/material';

const schema = z.object({
  type: z.enum(['SERVICE', 'PART']),
  description: z.string().min(1, 'Descrição obrigatória'),
  quantity: z.coerce.number().int().positive('Quantidade deve ser positiva'),
  unitPrice: z.coerce.number().positive('Preço deve ser positivo'),
});

export type BudgetItemFormValues = z.infer<typeof schema>;

export function BudgetItemFormDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: BudgetItemFormValues) => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BudgetItemFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'SERVICE', description: '', quantity: 1, unitPrice: 0 },
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Item do orçamento</DialogTitle>
      <form
        onSubmit={handleSubmit((values) => {
          onSubmit(values);
          reset();
        })}
      >
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField select label="Tipo" defaultValue="SERVICE" {...register('type')}>
            <MenuItem value="SERVICE">Serviço</MenuItem>
            <MenuItem value="PART">Peça</MenuItem>
          </TextField>
          <TextField
            label="Descrição"
            {...register('description')}
            error={!!errors.description}
            helperText={errors.description?.message}
          />
          <TextField
            label="Quantidade"
            type="number"
            {...register('quantity')}
            error={!!errors.quantity}
            helperText={errors.quantity?.message}
          />
          <TextField
            label="Preço unitário"
            type="number"
            {...register('unitPrice')}
            error={!!errors.unitPrice}
            helperText={errors.unitPrice?.message}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="contained">
            Salvar
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
```

`src/features/budgets/components/BudgetTab.tsx`:

```tsx
import { useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { StatusChip } from '../../../components/StatusChip';
import {
  useAcceptBudget,
  useAddBudgetItem,
  useBudgetsByServiceOrder,
  useCreateBudget,
  useRefuseBudget,
  useRemoveBudgetItem,
  useSendBudget,
} from '../hooks';
import { Budget, BudgetItem } from '../types';
import { BudgetItemFormDialog, BudgetItemFormValues } from './BudgetItemFormDialog';

const itemColumns: GridColDef<BudgetItem>[] = [
  { field: 'description', headerName: 'Descrição', flex: 1 },
  { field: 'type', headerName: 'Tipo', flex: 1 },
  { field: 'quantity', headerName: 'Quantidade', flex: 1 },
  { field: 'unitPrice', headerName: 'Preço unitário', flex: 1 },
  { field: 'subtotal', headerName: 'Subtotal', flex: 1 },
];

export function BudgetTab({ serviceOrderId }: { serviceOrderId: string }) {
  const { data: budgets = [] } = useBudgetsByServiceOrder(serviceOrderId);
  const budget: Budget | undefined = [...budgets].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )[0];

  const createBudget = useCreateBudget(serviceOrderId);
  const addItem = useAddBudgetItem(serviceOrderId, budget?.id ?? '');
  const removeItem = useRemoveBudgetItem(serviceOrderId, budget?.id ?? '');
  const sendBudget = useSendBudget(serviceOrderId, budget?.id ?? '');
  const acceptBudget = useAcceptBudget(serviceOrderId, budget?.id ?? '');
  const refuseBudget = useRefuseBudget(serviceOrderId, budget?.id ?? '');
  const [itemDialogOpen, setItemDialogOpen] = useState(false);

  function handleItemSubmit(values: BudgetItemFormValues) {
    if (!budget) {
      createBudget.mutate([values]);
    } else {
      addItem.mutate(values);
    }
    setItemDialogOpen(false);
  }

  if (!budget) {
    return (
      <Box>
        <Button variant="contained" onClick={() => setItemDialogOpen(true)}>
          Criar Orçamento
        </Button>
        <BudgetItemFormDialog
          open={itemDialogOpen}
          onClose={() => setItemDialogOpen(false)}
          onSubmit={handleItemSubmit}
        />
      </Box>
    );
  }

  return (
    <Box>
      <Stack direction="row" spacing={2} alignItems="center" mb={2}>
        <StatusChip status={budget.status} />
        <Typography variant="body1">Total: R$ {budget.totalAmount.toFixed(2)}</Typography>
      </Stack>
      <DataGrid
        rows={budget.items}
        columns={itemColumns}
        autoHeight
        onRowDoubleClick={(params) =>
          budget.status === 'GENERATED' && removeItem.mutate((params.row as BudgetItem).id)
        }
      />
      <Stack direction="row" spacing={2} mt={2}>
        {budget.status === 'GENERATED' && (
          <>
            <Button onClick={() => setItemDialogOpen(true)}>Adicionar item</Button>
            <Button variant="outlined" onClick={() => sendBudget.mutate()}>
              Enviar para aprovação
            </Button>
          </>
        )}
        {budget.status === 'WAITING_APPROVAL' && (
          <>
            <Button variant="contained" onClick={() => acceptBudget.mutate()}>
              Aceitar
            </Button>
            <Button
              color="error"
              variant="outlined"
              onClick={() => refuseBudget.mutate('Recusado pelo cliente')}
            >
              Recusar
            </Button>
          </>
        )}
      </Stack>
      <BudgetItemFormDialog
        open={itemDialogOpen}
        onClose={() => setItemDialogOpen(false)}
        onSubmit={handleItemSubmit}
      />
    </Box>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- BudgetTab.test.tsx`
Expected: PASS

- [ ] **Step 6: Wire tab into OS detail page**

In `src/features/service-orders/pages/ServiceOrderDetailPage.tsx`, import `BudgetTab` and change `TABS` to:

```tsx
export const TABS: TabEntry[] = [
  { label: 'Detalhes', render: (order) => <ServiceOrderDetailsTab order={order} /> },
  { label: 'Orçamento', render: (order) => <BudgetTab serviceOrderId={order.id} /> },
];
```

- [ ] **Step 7: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/features/budgets src/features/service-orders/pages/ServiceOrderDetailPage.tsx
git commit -m "feat: add budgets feature as Orcamento tab in service order detail"
```

---

### Task 12: Parts dispatch (Peças tab in OS detail)

**Files:**
- Modify: `src/features/parts/types.ts` — add `PartRequirement` and `PartsDispatchResult` types
- Modify: `src/features/parts/api.ts` — add `dispatchParts`
- Modify: `src/features/parts/hooks.ts` — add `useDispatchParts`
- Create: `src/features/parts/components/PartsDispatchTab.tsx`
- Modify: `src/features/service-orders/pages/ServiceOrderDetailPage.tsx` — append to `TABS`: `{ label: 'Peças', render: (order) => <PartsDispatchTab serviceOrderId={order.id} /> }`
- Test: `src/features/parts/components/PartsDispatchTab.test.tsx`

**Interfaces:**
- Consumes: `TABS`/`ServiceOrderDetailPage.tsx` (Tasks 10–11).
- Produces (added to `src/features/parts/types.ts`): `PartRequirement { partId: string; partName: string; required: number; available: number }`, `PartsDispatchResult { serviceOrderId: string; dispatched: boolean; purchaseOrderId: string | null; requirements: PartRequirement[] }`.
- Produces (added to `src/features/parts/hooks.ts`): `useDispatchParts(serviceOrderId: string)` — mutation with no input, resolves `PartsDispatchResult`, invalidates `['service-orders', serviceOrderId]` and `['parts']` on success.
- Produces: `PartsDispatchTab` (`{ serviceOrderId: string }`).

- [ ] **Step 1: Write failing PartsDispatchTab test**

`src/features/parts/components/PartsDispatchTab.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test/server';
import { PartsDispatchTab } from './PartsDispatchTab';

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PartsDispatchTab serviceOrderId="os1" />
    </QueryClientProvider>,
  );
}

describe('PartsDispatchTab', () => {
  it('despacha pecas e mostra requisitos com falta de estoque', async () => {
    server.use(
      http.post('http://localhost:3000/api/v1/parts/service-orders/os1/dispatch', () =>
        HttpResponse.json({
          serviceOrderId: 'os1',
          dispatched: false,
          purchaseOrderId: 'po1',
          requirements: [{ partId: 'p1', partName: 'Filtro de óleo', required: 5, available: 2 }],
        }),
      ),
    );

    renderTab();

    await userEvent.click(screen.getByRole('button', { name: /despachar pecas/i }));

    await waitFor(() => expect(screen.getByText('Filtro de óleo')).toBeInTheDocument());
    expect(screen.getByText(/pedido de compra gerado/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- PartsDispatchTab.test.tsx`
Expected: FAIL — `./PartsDispatchTab` does not exist.

- [ ] **Step 3: Add types, api function and hook**

In `src/features/parts/types.ts`, append:

```ts
export interface PartRequirement {
  partId: string;
  partName: string;
  required: number;
  available: number;
}

export interface PartsDispatchResult {
  serviceOrderId: string;
  dispatched: boolean;
  purchaseOrderId: string | null;
  requirements: PartRequirement[];
}
```

In `src/features/parts/api.ts`, append:

```ts
export async function dispatchParts(serviceOrderId: string): Promise<PartsDispatchResult> {
  const { data } = await apiClient.post<PartsDispatchResult>(
    `/parts/service-orders/${serviceOrderId}/dispatch`,
  );
  return data;
}
```

(add `PartsDispatchResult` to the existing `import { ... } from './types'` line)

In `src/features/parts/hooks.ts`, append:

```ts
export function useDispatchParts(serviceOrderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => dispatchParts(serviceOrderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-orders', serviceOrderId] });
      queryClient.invalidateQueries({ queryKey: PARTS_KEY });
    },
  });
}
```

(add `dispatchParts` to the existing `import { partsApi, registerMovement } from './api'` line)

- [ ] **Step 4: Implement `PartsDispatchTab.tsx`**

```tsx
import { Alert, Box, Button, Typography } from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { useDispatchParts } from '../hooks';
import { PartRequirement } from '../types';

const columns: GridColDef<PartRequirement>[] = [
  { field: 'partName', headerName: 'Peça', flex: 1 },
  { field: 'required', headerName: 'Necessário', flex: 1 },
  { field: 'available', headerName: 'Disponível', flex: 1 },
];

export function PartsDispatchTab({ serviceOrderId }: { serviceOrderId: string }) {
  const dispatchParts = useDispatchParts(serviceOrderId);
  const result = dispatchParts.data;

  return (
    <Box>
      <Button variant="contained" onClick={() => dispatchParts.mutate()} sx={{ mb: 2 }}>
        Despachar Peças
      </Button>
      {result && (
        <Box>
          <Typography variant="body1" mb={1}>
            {result.dispatched ? 'Peças despachadas com sucesso.' : 'Estoque insuficiente.'}
          </Typography>
          {result.purchaseOrderId && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Pedido de compra gerado: {result.purchaseOrderId}
            </Alert>
          )}
          <DataGrid rows={result.requirements} columns={columns} getRowId={(row) => row.partId} autoHeight />
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- PartsDispatchTab.test.tsx`
Expected: PASS

- [ ] **Step 6: Wire tab into OS detail page**

In `src/features/service-orders/pages/ServiceOrderDetailPage.tsx`, import `PartsDispatchTab` and change `TABS` to:

```tsx
export const TABS: TabEntry[] = [
  { label: 'Detalhes', render: (order) => <ServiceOrderDetailsTab order={order} /> },
  { label: 'Orçamento', render: (order) => <BudgetTab serviceOrderId={order.id} /> },
  { label: 'Peças', render: (order) => <PartsDispatchTab serviceOrderId={order.id} /> },
];
```

- [ ] **Step 7: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/features/parts src/features/service-orders/pages/ServiceOrderDetailPage.tsx
git commit -m "feat: add parts dispatch as Pecas tab in service order detail"
```

---

### Task 13: Billing feature (Faturamento tab + standalone list page)

**Files:**
- Create: `src/features/billing/types.ts`
- Create: `src/features/billing/api.ts`
- Create: `src/features/billing/hooks.ts`
- Create: `src/features/billing/components/BillingTab.tsx`
- Create: `src/features/billing/pages/BillingPage.tsx`
- Modify: `src/features/service-orders/pages/ServiceOrderDetailPage.tsx` — append to `TABS`: `{ label: 'Faturamento', render: (order) => <BillingTab serviceOrderId={order.id} /> }`
- Modify: `src/routes.tsx` — add `<Route path="/faturamento" element={<BillingPage />} />`
- Modify: `src/components/Layout.tsx` (`NAV_ITEMS`) — add `{ label: 'Faturamento', path: '/faturamento' }`
- Test: `src/features/billing/components/BillingTab.test.tsx`

**Interfaces:**
- Consumes: `apiClient` (Task 2), `StatusChip` (Task 10), `TABS`/`ServiceOrderDetailPage.tsx` (Tasks 10–12).
- Produces: `BillingStatus = 'PENDING' | 'WAITING_PAYMENT' | 'PAID' | 'EXPIRED'`, `PaymentMethod = 'PIX' | 'CARD' | 'CASH'`, `BillingPenalty { originalAmount: number; fixedPenaltyAmount: number; interestAmount: number; overdueDays: number; totalAmount: number; calculatedAt: string }`, `Billing { id: string; serviceOrderId: string; budgetId: string; status: BillingStatus; amount: number; amountDue: number; paymentLink: string | null; gatewayTransactionId: string | null; paymentMethod: PaymentMethod | null; generatedAt: string; paidAt: string | null; expiresAt: string | null; penalty: BillingPenalty | null; createdAt: string; updatedAt: string }` (`types.ts`).
- Produces: `useBillingsByServiceOrder(serviceOrderId: string)`, `useAllBillings()`, `useGenerateBilling()`, `useExpireBilling(id: string)`, `useRenewPaymentLink(id: string)`, `useDeliverServiceOrder(id: string, serviceOrderId: string)` (`hooks.ts`), query key `['billings']`.
- Produces: `BillingTab` (`{ serviceOrderId: string }`), `BillingPage` (default export, standalone list).

- [ ] **Step 1: Write failing BillingTab test**

`src/features/billing/components/BillingTab.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test/server';
import { BillingTab } from './BillingTab';

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BillingTab serviceOrderId="os1" />
    </QueryClientProvider>,
  );
}

describe('BillingTab', () => {
  it('gera cobranca quando nenhuma existe para a OS', async () => {
    server.use(
      http.get('http://localhost:3000/api/v1/billings', () => HttpResponse.json([])),
      http.post('http://localhost:3000/api/v1/billings', () =>
        HttpResponse.json({
          id: 'bill1',
          serviceOrderId: 'os1',
          budgetId: 'b1',
          status: 'WAITING_PAYMENT',
          amount: 150,
          amountDue: 150,
          paymentLink: 'https://checkout.stripe.com/xyz',
          gatewayTransactionId: null,
          paymentMethod: null,
          generatedAt: '2026-01-01T00:00:00.000Z',
          paidAt: null,
          expiresAt: '2026-01-08T00:00:00.000Z',
          penalty: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        }),
      ),
    );

    renderTab();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /gerar cobranca/i })).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: /gerar cobranca/i }));

    await waitFor(() =>
      expect(screen.getByText('https://checkout.stripe.com/xyz')).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- BillingTab.test.tsx`
Expected: FAIL — `./BillingTab` does not exist.

- [ ] **Step 3: Implement `types.ts`, `api.ts`, `hooks.ts`**

`src/features/billing/types.ts`:

```ts
export type BillingStatus = 'PENDING' | 'WAITING_PAYMENT' | 'PAID' | 'EXPIRED';
export type PaymentMethod = 'PIX' | 'CARD' | 'CASH';

export interface BillingPenalty {
  originalAmount: number;
  fixedPenaltyAmount: number;
  interestAmount: number;
  overdueDays: number;
  totalAmount: number;
  calculatedAt: string;
}

export interface Billing {
  id: string;
  serviceOrderId: string;
  budgetId: string;
  status: BillingStatus;
  amount: number;
  amountDue: number;
  paymentLink: string | null;
  gatewayTransactionId: string | null;
  paymentMethod: PaymentMethod | null;
  generatedAt: string;
  paidAt: string | null;
  expiresAt: string | null;
  penalty: BillingPenalty | null;
  createdAt: string;
  updatedAt: string;
}
```

`src/features/billing/api.ts`:

```ts
import apiClient from '../../lib/apiClient';
import { Billing } from './types';

export async function listBillings(serviceOrderId?: string): Promise<Billing[]> {
  const { data } = await apiClient.get<Billing[]>('/billings', {
    params: serviceOrderId ? { serviceOrderId } : undefined,
  });
  return data;
}

export async function generateBilling(serviceOrderId: string): Promise<Billing> {
  const { data } = await apiClient.post<Billing>('/billings', { serviceOrderId });
  return data;
}

export async function expireBilling(id: string): Promise<Billing> {
  const { data } = await apiClient.post<Billing>(`/billings/${id}/expire`);
  return data;
}

export async function renewPaymentLink(id: string): Promise<Billing> {
  const { data } = await apiClient.post<Billing>(`/billings/${id}/renew-payment-link`);
  return data;
}

export async function deliverServiceOrder(id: string): Promise<void> {
  await apiClient.post(`/billings/${id}/deliver-service-order`);
}
```

`src/features/billing/hooks.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as billingApi from './api';

const BILLINGS_KEY = ['billings'];

export function useBillingsByServiceOrder(serviceOrderId: string) {
  return useQuery({
    queryKey: [...BILLINGS_KEY, 'service-order', serviceOrderId],
    queryFn: () => billingApi.listBillings(serviceOrderId),
    enabled: Boolean(serviceOrderId),
  });
}

export function useAllBillings() {
  return useQuery({ queryKey: BILLINGS_KEY, queryFn: () => billingApi.listBillings() });
}

export function useGenerateBilling() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (serviceOrderId: string) => billingApi.generateBilling(serviceOrderId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BILLINGS_KEY }),
  });
}

export function useExpireBilling(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => billingApi.expireBilling(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BILLINGS_KEY }),
  });
}

export function useRenewPaymentLink(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => billingApi.renewPaymentLink(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BILLINGS_KEY }),
  });
}

export function useDeliverServiceOrder(id: string, serviceOrderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => billingApi.deliverServiceOrder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BILLINGS_KEY });
      queryClient.invalidateQueries({ queryKey: ['service-orders', serviceOrderId] });
    },
  });
}
```

- [ ] **Step 4: Implement `BillingTab.tsx` and `BillingPage.tsx`**

`src/features/billing/components/BillingTab.tsx`:

```tsx
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { StatusChip } from '../../../components/StatusChip';
import {
  useBillingsByServiceOrder,
  useDeliverServiceOrder,
  useExpireBilling,
  useGenerateBilling,
  useRenewPaymentLink,
} from '../hooks';

export function BillingTab({ serviceOrderId }: { serviceOrderId: string }) {
  const { data: billings = [] } = useBillingsByServiceOrder(serviceOrderId);
  const billing = billings[0];
  const generateBilling = useGenerateBilling();
  const expireBilling = useExpireBilling(billing?.id ?? '');
  const renewPaymentLink = useRenewPaymentLink(billing?.id ?? '');
  const deliverServiceOrder = useDeliverServiceOrder(billing?.id ?? '', serviceOrderId);

  if (!billing) {
    return (
      <Button variant="contained" onClick={() => generateBilling.mutate(serviceOrderId)}>
        Gerar Cobrança
      </Button>
    );
  }

  return (
    <Box>
      <Stack direction="row" spacing={2} alignItems="center" mb={2}>
        <StatusChip status={billing.status} />
        <Typography variant="body1">
          Valor devido: R$ {billing.amountDue.toFixed(2)}
        </Typography>
      </Stack>
      {billing.paymentLink && (
        <Alert severity="info" sx={{ mb: 2 }}>{billing.paymentLink}</Alert>
      )}
      <Stack direction="row" spacing={2}>
        {billing.status === 'WAITING_PAYMENT' && (
          <Button variant="outlined" onClick={() => expireBilling.mutate()}>
            Expirar
          </Button>
        )}
        {billing.status === 'EXPIRED' && (
          <Button variant="outlined" onClick={() => renewPaymentLink.mutate()}>
            Renovar link de pagamento
          </Button>
        )}
        {billing.status === 'PAID' && (
          <Button variant="contained" onClick={() => deliverServiceOrder.mutate()}>
            Entregar veículo
          </Button>
        )}
      </Stack>
    </Box>
  );
}
```

`src/features/billing/pages/BillingPage.tsx`:

```tsx
import { Box, Typography } from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { StatusChip } from '../../../components/StatusChip';
import { useAllBillings } from '../hooks';
import { Billing } from '../types';

const columns: GridColDef<Billing>[] = [
  { field: 'serviceOrderId', headerName: 'Ordem de Serviço', flex: 1 },
  {
    field: 'status',
    headerName: 'Status',
    flex: 1,
    renderCell: (params) => <StatusChip status={params.row.status} />,
  },
  { field: 'amountDue', headerName: 'Valor devido', flex: 1 },
];

export default function BillingPage() {
  const { data: billings = [], isLoading } = useAllBillings();

  return (
    <Box>
      <Typography variant="h4" mb={2}>
        Faturamento
      </Typography>
      <DataGrid rows={billings} columns={columns} loading={isLoading} autoHeight />
    </Box>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- BillingTab.test.tsx`
Expected: PASS

- [ ] **Step 6: Wire tab, route and nav entry**

In `src/features/service-orders/pages/ServiceOrderDetailPage.tsx`, import `BillingTab` and change `TABS` to:

```tsx
export const TABS: TabEntry[] = [
  { label: 'Detalhes', render: (order) => <ServiceOrderDetailsTab order={order} /> },
  { label: 'Orçamento', render: (order) => <BudgetTab serviceOrderId={order.id} /> },
  { label: 'Peças', render: (order) => <PartsDispatchTab serviceOrderId={order.id} /> },
  { label: 'Faturamento', render: (order) => <BillingTab serviceOrderId={order.id} /> },
];
```

`src/routes.tsx`: add `<Route path="/faturamento" element={<BillingPage />} />`.
`src/components/Layout.tsx`: append `{ label: 'Faturamento', path: '/faturamento' }` to `NAV_ITEMS`.

- [ ] **Step 7: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/features/billing src/features/service-orders/pages/ServiceOrderDetailPage.tsx src/routes.tsx src/components/Layout.tsx
git commit -m "feat: add billing feature with Faturamento tab and standalone list"
```

---

### Task 14: Notifications feature (ADMIN only)

**Files:**
- Create: `src/features/notifications/types.ts`
- Create: `src/features/notifications/api.ts`
- Create: `src/features/notifications/hooks.ts`
- Create: `src/features/notifications/pages/NotificationsPage.tsx`
- Modify: `src/routes.tsx` — add `<Route path="/notificacoes" element={<ProtectedRoute roles={['ADMIN']}><NotificationsPage /></ProtectedRoute>} />`
- Modify: `src/components/Layout.tsx` (`NAV_ITEMS`) — add `{ label: 'Notificações', path: '/notificacoes', roles: ['ADMIN'] }`
- Test: `src/features/notifications/pages/NotificationsPage.test.tsx`

**Interfaces:**
- Consumes: `apiClient` (Task 2), `StatusChip` (Task 10), `ProtectedRoute` (Task 3).
- Produces: `NotificationStatus = 'PENDING' | 'SENT' | 'FAILED'`, `NotificationType = 'BUDGET_READY' | 'PAYMENT_LINK_READY' | 'STOCK_PARTS_REQUESTED'`, `Notification { id: string; type: NotificationType; status: NotificationStatus; to: string; subject: string; text: string; html: string; attempts: number; lastError: string | null; sentAt: string | null; createdAt: string; updatedAt: string }` (`types.ts`).
- Produces: `useNotifications()`, `useRetryNotification()` (`hooks.ts`), query key `['notifications']`.

- [ ] **Step 1: Write failing NotificationsPage test**

`src/features/notifications/pages/NotificationsPage.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test/server';
import NotificationsPage from './NotificationsPage';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationsPage />
    </QueryClientProvider>,
  );
}

const failedNotification = {
  id: 'n1',
  type: 'BUDGET_READY',
  status: 'FAILED',
  to: 'cliente@x.com',
  subject: 'Orçamento pronto',
  text: 'texto',
  html: '<p>texto</p>',
  attempts: 1,
  lastError: 'SMTP timeout',
  sentAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('NotificationsPage', () => {
  it('lista notificacoes e reenvia uma falhada', async () => {
    server.use(
      http.get('http://localhost:3000/api/v1/notifications', () =>
        HttpResponse.json([failedNotification]),
      ),
      http.post('http://localhost:3000/api/v1/notifications/n1/retry', () =>
        HttpResponse.json({ ...failedNotification, status: 'SENT', sentAt: '2026-01-02T00:00:00.000Z' }),
      ),
    );

    renderPage();

    await waitFor(() => expect(screen.getByText('Orçamento pronto')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /reenviar/i }));

    await waitFor(() => expect(screen.getByText('SENT')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- NotificationsPage.test.tsx`
Expected: FAIL — `./NotificationsPage` does not exist.

- [ ] **Step 3: Implement `types.ts`, `api.ts`, `hooks.ts`**

`src/features/notifications/types.ts`:

```ts
export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED';
export type NotificationType = 'BUDGET_READY' | 'PAYMENT_LINK_READY' | 'STOCK_PARTS_REQUESTED';

export interface Notification {
  id: string;
  type: NotificationType;
  status: NotificationStatus;
  to: string;
  subject: string;
  text: string;
  html: string;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

`src/features/notifications/api.ts`:

```ts
import apiClient from '../../lib/apiClient';
import { Notification } from './types';

export async function listNotifications(): Promise<Notification[]> {
  const { data } = await apiClient.get<Notification[]>('/notifications');
  return data;
}

export async function retryNotification(id: string): Promise<Notification> {
  const { data } = await apiClient.post<Notification>(`/notifications/${id}/retry`);
  return data;
}
```

`src/features/notifications/hooks.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as notificationsApi from './api';

const NOTIFICATIONS_KEY = ['notifications'];

export function useNotifications() {
  return useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: notificationsApi.listNotifications,
  });
}

export function useRetryNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.retryNotification(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
}
```

- [ ] **Step 4: Implement `NotificationsPage.tsx`**

```tsx
import { Box, Button, Typography } from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { StatusChip } from '../../../components/StatusChip';
import { useNotifications, useRetryNotification } from '../hooks';
import { Notification } from '../types';

export default function NotificationsPage() {
  const { data: notifications = [], isLoading } = useNotifications();
  const retryNotification = useRetryNotification();

  const columns: GridColDef<Notification>[] = [
    { field: 'subject', headerName: 'Assunto', flex: 1 },
    { field: 'to', headerName: 'Destinatário', flex: 1 },
    {
      field: 'status',
      headerName: 'Status',
      flex: 1,
      renderCell: (params) => <StatusChip status={params.row.status} />,
    },
    {
      field: 'actions',
      headerName: '',
      flex: 1,
      renderCell: (params) =>
        params.row.status === 'FAILED' ? (
          <Button size="small" onClick={() => retryNotification.mutate(params.row.id)}>
            Reenviar
          </Button>
        ) : null,
    },
  ];

  return (
    <Box>
      <Typography variant="h4" mb={2}>
        Notificações
      </Typography>
      <DataGrid rows={notifications} columns={columns} loading={isLoading} autoHeight />
    </Box>
  );
}
```

- [ ] **Step 5: Wire route and nav entry (role-gated)**

`src/routes.tsx`: import `NotificationsPage` and add:

```tsx
<Route
  path="/notificacoes"
  element={
    <ProtectedRoute roles={['ADMIN']}>
      <NotificationsPage />
    </ProtectedRoute>
  }
/>
```

`src/components/Layout.tsx`: append `{ label: 'Notificações', path: '/notificacoes', roles: ['ADMIN'] }` to `NAV_ITEMS`.

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- NotificationsPage.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/notifications src/routes.tsx src/components/Layout.tsx
git commit -m "feat: add notifications feature, admin-only"
```

---

### Task 15: Dashboard (average execution time + status counts)

**Files:**
- Modify: `src/features/service-orders/api.ts` — add `getAverageExecutionTime`
- Modify: `src/features/service-orders/hooks.ts` — add `useAverageExecutionTime`
- Modify: `src/features/dashboard/pages/DashboardPage.tsx` — replace placeholder body with real metrics
- Test: `src/features/dashboard/pages/DashboardPage.test.tsx`

**Interfaces:**
- Consumes: `useServiceOrders` (Task 10), `StatusChip` (Task 10).
- Produces (added to `src/features/service-orders/types.ts`): `AverageExecutionTime { averageExecutionTimeMs: number | null; sampleSize: number }`.
- Produces (added to `src/features/service-orders/hooks.ts`): `useAverageExecutionTime()`, query key `['service-orders', 'metrics', 'average-execution-time']`.

- [ ] **Step 1: Write failing DashboardPage test**

`src/features/dashboard/pages/DashboardPage.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test/server';
import DashboardPage from './DashboardPage';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DashboardPage />
    </QueryClientProvider>,
  );
}

describe('DashboardPage', () => {
  it('mostra tempo medio de execucao e contagem por status', async () => {
    server.use(
      http.get(
        'http://localhost:3000/api/v1/service-orders/metrics/average-execution-time',
        () => HttpResponse.json({ averageExecutionTimeMs: 7_200_000, sampleSize: 4 }),
      ),
      http.get('http://localhost:3000/api/v1/service-orders', () =>
        HttpResponse.json([
          { id: '1', status: 'RECEIVED' },
          { id: '2', status: 'RECEIVED' },
          { id: '3', status: 'COMPLETED' },
        ]),
      ),
    );

    renderPage();

    await waitFor(() => expect(screen.getByText(/2h/)).toBeInTheDocument());
    expect(screen.getByText('4 OS')).toBeInTheDocument();
    expect(screen.getByText('RECEIVED: 2')).toBeInTheDocument();
    expect(screen.getByText('COMPLETED: 1')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- DashboardPage.test.tsx`
Expected: FAIL — `DashboardPage` still renders only the Task 4 placeholder heading.

- [ ] **Step 3: Add `getAverageExecutionTime` and `useAverageExecutionTime`**

In `src/features/service-orders/types.ts`, append:

```ts
export interface AverageExecutionTime {
  averageExecutionTimeMs: number | null;
  sampleSize: number;
}
```

In `src/features/service-orders/api.ts`, append (and add `AverageExecutionTime` to the `./types` import):

```ts
export async function getAverageExecutionTime(): Promise<AverageExecutionTime> {
  const { data } = await apiClient.get<AverageExecutionTime>(
    '/service-orders/metrics/average-execution-time',
  );
  return data;
}
```

In `src/features/service-orders/hooks.ts`, append:

```ts
export function useAverageExecutionTime() {
  return useQuery({
    queryKey: [...SERVICE_ORDERS_KEY, 'metrics', 'average-execution-time'],
    queryFn: serviceOrdersApi.getAverageExecutionTime,
  });
}
```

- [ ] **Step 4: Implement `DashboardPage.tsx`**

```tsx
import { Box, Card, CardContent, Stack, Typography } from '@mui/material';
import { useAverageExecutionTime, useServiceOrders } from '../../service-orders/hooks';
import { ServiceOrderStatus } from '../../service-orders/types';

function formatDuration(ms: number | null): string {
  if (ms === null) return 'sem dados';
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.round((ms % 3_600_000) / 60_000);
  return `${hours}h${minutes.toString().padStart(2, '0')}min`;
}

export default function DashboardPage() {
  const { data: metrics } = useAverageExecutionTime();
  const { data: orders = [] } = useServiceOrders();

  const countsByStatus = orders.reduce<Record<string, number>>((acc, order) => {
    acc[order.status] = (acc[order.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <Box>
      <Typography variant="h4" mb={3}>
        Dashboard
      </Typography>
      <Stack direction="row" spacing={2} mb={3}>
        <Card>
          <CardContent>
            <Typography variant="body2" color="text.secondary">
              Tempo médio de execução
            </Typography>
            <Typography variant="h5">
              {metrics ? formatDuration(metrics.averageExecutionTimeMs) : '...'}
            </Typography>
            <Typography variant="caption">{metrics ? `${metrics.sampleSize} OS` : ''}</Typography>
          </CardContent>
        </Card>
      </Stack>
      <Typography variant="h6" mb={1}>
        Ordens por status
      </Typography>
      <Stack spacing={1}>
        {(Object.entries(countsByStatus) as Array<[ServiceOrderStatus, number]>).map(
          ([status, count]) => (
            <Typography key={status}>
              {status}: {count}
            </Typography>
          ),
        )}
      </Stack>
    </Box>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- DashboardPage.test.tsx`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: PASS (all suites across the whole app)

- [ ] **Step 7: Commit**

```bash
git add src/features/service-orders/api.ts src/features/service-orders/hooks.ts src/features/service-orders/types.ts src/features/dashboard
git commit -m "feat: add dashboard with average execution time and status counts"
```

---

---

### Task 16: Global error toast

Closes the spec's error-handling requirement: every `ApiError` from any query/mutation across the whole app (Tasks 5–15's `createCrudApi`/hand-written `api.ts` calls all go through the shared `apiClient`) surfaces as a toast automatically, without each feature wiring its own error display.

**Files:**
- Create: `src/lib/toast.ts`
- Create: `src/components/ToastHost.tsx`
- Modify: `src/lib/queryClient.ts` — add global `QueryCache`/`MutationCache` `onError`
- Modify: `src/main.tsx` — mount `<ToastHost />`
- Test: `src/components/ToastHost.test.tsx`

**Interfaces:**
- Consumes: `ApiError` (Task 2), `queryClient` (Task 1).
- Produces: `showToast(message: string, severity?: 'error' | 'success' | 'info'): void`, `subscribeToast(listener: (event: { message: string; severity: 'error' | 'success' | 'info' }) => void): () => void` (`toast.ts`).
- Produces: `ToastHost` (default export) — renders the `Snackbar`/`Alert`, no props.

- [ ] **Step 1: Write failing ToastHost test**

`src/components/ToastHost.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ToastHost from './ToastHost';
import { showToast } from '../lib/toast';

describe('ToastHost', () => {
  it('mostra mensagem publicada via showToast', async () => {
    render(<ToastHost />);

    showToast('Falha ao salvar cliente', 'error');

    await waitFor(() =>
      expect(screen.getByText('Falha ao salvar cliente')).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ToastHost.test.tsx`
Expected: FAIL — `./ToastHost` and `../lib/toast` do not exist.

- [ ] **Step 3: Implement `toast.ts`**

```ts
export type ToastSeverity = 'error' | 'success' | 'info';
export interface ToastEvent {
  message: string;
  severity: ToastSeverity;
}

type Listener = (event: ToastEvent) => void;

const listeners = new Set<Listener>();

export function showToast(message: string, severity: ToastSeverity = 'info'): void {
  listeners.forEach((listener) => listener({ message, severity }));
}

export function subscribeToast(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
```

- [ ] **Step 4: Implement `ToastHost.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Alert, Snackbar } from '@mui/material';
import { subscribeToast, ToastEvent } from '../lib/toast';

export default function ToastHost() {
  const [event, setEvent] = useState<ToastEvent | null>(null);

  useEffect(() => subscribeToast(setEvent), []);

  return (
    <Snackbar
      open={Boolean(event)}
      autoHideDuration={5000}
      onClose={() => setEvent(null)}
    >
      {event ? (
        <Alert severity={event.severity} onClose={() => setEvent(null)}>
          {event.message}
        </Alert>
      ) : undefined}
    </Snackbar>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- ToastHost.test.tsx`
Expected: PASS

- [ ] **Step 6: Wire global error reporting into `queryClient.ts` and mount `ToastHost` in `main.tsx`**

`src/lib/queryClient.ts`:

```ts
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from './apiError';
import { showToast } from './toast';

function reportError(error: unknown) {
  showToast(error instanceof ApiError ? error.message : 'Erro inesperado', 'error');
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
  queryCache: new QueryCache({ onError: reportError }),
  mutationCache: new MutationCache({ onError: reportError }),
});
```

In `src/main.tsx`, import `ToastHost` and render it once, as a sibling of `<App />` inside `<BrowserRouter>`:

```tsx
import ToastHost from './components/ToastHost';
// ...
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter>
          <App />
          <ToastHost />
        </BrowserRouter>
      </ThemeProvider>
```

- [ ] **Step 7: Run full test suite**

Run: `npm test`
Expected: PASS (all suites across the whole app)

- [ ] **Step 8: Commit**

```bash
git add src/lib/toast.ts src/components/ToastHost.tsx src/lib/queryClient.ts src/main.tsx src/components/ToastHost.test.tsx
git commit -m "feat: add global error toast wired into query/mutation cache"
```

---

## Post-plan manual steps (not part of any task, do once before first run)

1. In `c:\oficina-fiap-api`, ensure the backend is running: `docker compose up -d db && npx prisma migrate dev && npx prisma db seed && npm run start:dev` (or `docker compose up --build`).
2. In `C:/oficina-fiap-api-frontend`, run `npm run dev` and open the printed Vite URL (default `http://localhost:5173`) — confirm it matches `FRONTEND_ORIGIN` in the backend's `.env`.
3. Log in with the seeded `ADMIN_EMAIL`/`ADMIN_PASSWORD` from the backend's `.env`.
