# Testes de carga e concorrência (k6)

A suíte mede capacidade e latência dos fluxos críticos e verifica regras que
não podem quebrar sob concorrência. Tudo roda em Docker, num projeto Compose
isolado (`oficina-load`) com banco próprio:

- a API usa a imagem de produção (`runtime`, `NODE_ENV=production`);
- pagamentos vão para o `stripe-fake` (`test/load/stripe-fake`), que imita as
  chamadas de Checkout Session do Stripe — **nada é enviado ao Stripe real**;
- e-mails vão para o Mailpit (interface em http://localhost:8025);
- o k6 roda no container `grafana/k6:2.3.0`.

## Como rodar

```bash
npm run docker:down     # a stack de dev usa os mesmos nomes de container
npm run load:up         # sobe banco, migrations, seed, API, Mailpit e stripe-fake
npm run load:smoke      # sanidade: jornada completa + listagens
npm run load:<cenário>  # veja a tabela abaixo
npm run load:down       # remove containers e o banco de carga
```

O `.env` precisa de `POSTGRES_PASSWORD`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` e das
demais variáveis obrigatórias do `docker-compose.yml`. Stripe, SMTP e segredos
JWT são sobrescritos pelo `docker-compose.load.yml`.

Variáveis passam pelo ambiente do shell, por exemplo
`PROFILE=load npm run load:journey` ou `ITERATIONS=50 npm run load:race:stock`.

## No GitHub Actions

Workflows disparadas manualmente (aba **Actions** → escolha a workflow →
**Run workflow**), todas usando a reutilizável `k6-run.yml`:

| Workflow | O que roda | Entradas |
| --- | --- | --- |
| Carga: smoke | `smoke` | — |
| Carga: concorrência | as 4 corridas ou uma delas | corrida, iterações |
| Carga: desempenho | `journey`, `auth`, `customer` ou `webhook` | cenário, perfil |
| Carga: volume | `seed` + `read` | volume (1k/10k/50k), taxa, duração |
| Carga: escala no EKS | `auth` contra a produção, acompanhando o HPA | perfil, contas, minutos de descida, intervalo, URL |

Cada execução mostra os thresholds de cada cenário no resumo da página e
publica os relatórios (`test/load/results/`, inclusive `compose.log`) como
artefato por 14 dias. O job falha se algum threshold falhar. Nenhum segredo é
necessário: no CI o `test/load/ci.sh` gera um `.env` descartável, e Stripe,
SMTP e JWT já são sobrescritos pelo `docker-compose.load.yml`.

O mesmo script roda localmente com o seu `.env`:

```bash
npm run docker:down
ITERATIONS=50 test/load/ci.sh race:stock race:mechanic
PROFILE=load test/load/ci.sh journey
```

O runner `ubuntu-latest` tem 4 vCPUs compartilhadas. Smoke e concorrência
verificam regras e são confiáveis lá; os números de desempenho e volume só
se comparam com outras execuções do próprio Actions.

### Escala no EKS

A "Carga: escala no EKS" não sobe o Compose: assume a role do CD (OIDC, só a
partir da `main`), roda o `auth` contra o Service LoadBalancer e amostra o
HPA a cada `intervalo` segundos, antes, durante e depois da carga. O log
mostra as réplicas ao vivo (`[hpa hh:mm:ss load] réplicas 2→4 · CPU 340% ...`);
o resumo traz o pico e cada mudança de réplicas, e o artefato guarda
`eks-hpa.csv`, `eks-hpa-describe.txt` e `eks-events.txt`.

- Só o `auth`: `journey`, `webhook` e `customer` chamam o Stripe ou o SMTP de
  produção.
- As credenciais do admin vêm do Secret `oficina-seed-secrets` do cluster;
  nenhum segredo novo no GitHub.
- O setup cria `contas` clientes "Cliente Carga" no banco de produção.
- O job falha se o HPA não escalar. Thresholds do k6 reprovados no `stress`
  e no `spike` são esperados e aparecem só como aviso.

Localmente, com o kubeconfig do cluster: `PROFILE=stress test/load/eks.sh`.

Workflows com `workflow_dispatch` só aparecem na aba Actions depois que os
arquivos chegam à branch padrão (`main`).

## Cenários

| Comando | Objetivo | Perfis / variáveis |
| --- | --- | --- |
| `load:smoke` | Sanidade do ambiente e da suíte | — |
| `load:race:stock` | Saída de estoque nunca deixa saldo negativo; `idempotencyKey` repetida baixa uma vez | `ITERATIONS` (20) |
| `load:race:mechanic` | Mecânico não fica com duas OSs abertas | `ITERATIONS` (20) |
| `load:race:refresh` | Refresh token consumido em paralelo gera um único par novo | `ITERATIONS` (20) |
| `load:race:budget` | Aceite e recusa simultâneos gravam uma única decisão | `ITERATIONS` (20) |
| `load:journey` | Jornada completa da OS, latência por etapa | `PROFILE=smoke\|load\|soak` |
| `load:soak` | Jornada por 45 min (vazamento de memória/conexões) | rode `test/load/watch-resources.sh` junto |
| `load:auth` | Capacidade de login (bcrypt custo 12) | `PROFILE=smoke\|stress\|spike`, `ACCOUNTS` (50) |
| `load:seed` | Popula o banco para o `load:read` | `VOLUME` (1000), `SEED_VUS` (20) |
| `load:read` | Listagens sem paginação sob volume | `RATE` (30/s), `DURATION` (3m) |
| `load:webhook` | Webhook duplicado, assinatura inválida e rajada | `DUPLICATES` (10), `BURST` (50) |
| `load:customer` | Área do cliente e isolamento entre clientes | `PROFILE=smoke\|load`, `CUSTOMERS` (20) |

### Leitura em volume

O volume semeado é cumulativo. Para cada patamar, recrie o ambiente:

```bash
npm run load:down && npm run load:up
VOLUME=10000 npm run load:seed
npm run load:read
```

## Como ler o resultado

- **Invariantes** (`*_oversell`, `*_double_*`, `*_violation`, `*_leak`,
  `webhook_forgery_accepted`): contadores com threshold `count==0`. Qualquer
  valor acima de zero reprova a execução, e o log mostra o caso (`[métrica] {...}`).
- **Latência por rota**: `http_req_duration{name:<rota>}`. As rotas usam
  template (`/budgets/:id/accept`), então os ids não fragmentam as métricas.
- **Latência por etapa da jornada**: `group_duration` de cada `group`.
- `http_req_failed` só conta como falha os status fora do esperado: nos
  cenários de corrida, 409 é a resposta correta para quem perde.

## Baselines e achados

Primeira medição: 2026-10-13, commit `dd93896`, AMD Ryzen 5 5500 (12 threads),
15 GB, Docker Desktop/WSL 2, 1 pod da API. Refaça e acrescente uma linha a
cada mudança relevante.

### Invariantes de concorrência (20 corridas cada)

| Cenário | Resultado |
| --- | --- |
| `race:stock` | ✓ 10 de 30 saídas aceitas, saldo final 0; `idempotencyKey` repetida baixa uma vez |
| `race:refresh` | ✓ 1 refresh vencedor (201), 9 × 401 |
| `race:budget` | ✓ uma única decisão, OS coerente, sem 5xx |
| `race:mechanic` | ✓ desde o #69. Antes: o índice único parcial `service_order_active_mechanic_key` já impedia a dupla atribuição, mas quem perdia a corrida recebia **500** (`P2002` sem tradução) em vez de 409 `MECHANIC_BUSY` — 20 de 20 corridas `{"200":1,"500":4}`. Depois: 0 respostas 5xx, 0 duplas atribuições, 341/341 com o status esperado. Branches sem o commit do #69 ainda reprovam este cenário |
| `webhook` | ✓ evento duplicado ×5 → cobrança PAID sem 5xx; 3.000 assinaturas inválidas → 400; rajada de 50 eventos válidos → 204 |
| `customer` (load) | ✓ 34.579 requisições, nenhum vazamento entre clientes; p95 < 11 ms |

### Jornada da OS (`PROFILE=load`, até 20 VUs, 8 min)

1.272 jornadas completas, 16.568 requisições, 0 falhas, jornada p95 7,3 s
(inclui ~6 s de pausas simuladas).

| Rota | p95 |
| --- | --- |
| `POST /billings` (inclui o stripe-fake) | 57 ms |
| `POST /budgets` | 43 ms |
| `POST /parts/service-orders/:id/dispatch` | 42 ms |
| `POST /billings/stripe/webhook` | 38 ms |
| `POST /budgets/:id/accept` | 38 ms |
| `POST /budgets/:id/send`, `PATCH .../assign`, `.../complete`, `POST .../deliver-service-order`, `POST /service-orders` | 19–21 ms |
| `GET /service-orders/:id` | 4 ms |

### Autenticação (`PROFILE=stress`)

Saturou em **~3,6 ciclos login→refresh→logout por segundo** (p95 do login
46 s, 18.278 iterações descartadas, timeouts). A CPU do container ficou em
~400%: o bcrypt (custo 12) roda no pool de 4 threads do libuv. Cada ciclo faz
5 operações bcrypt — login compara a senha **e** gera o hash da sessão de
refresh; refresh compara e gera outro hash; logout compara —, ~220 ms cada.
Na prática: **~9 logins/s por pod**. Insumo para HPA e `requests` de CPU no
EKS; o hash bcrypt do refresh token (já de alta entropia) é o candidato
óbvio a otimização.

### Leitura em volume (`VOLUME=1000`, 30 req/s, 3 min)

Banco com 2.593 OSs, 2.483 clientes, 1.893 orçamentos e 14.130 notificações
(seed + resíduo dos cenários anteriores). Todas as listagens reprovaram:
p95 de 6 s (`/services`, `/parts`) a 14,6 s (`/clients`), 7,3 GB trafegados,
870 iterações descartadas.

| Rota | Tamanho da resposta | Tempo isolado |
| --- | --- | --- |
| `GET /notifications` | **10,8 MB** (HTML completo de cada e-mail) | 203 ms |
| `GET /budgets` | 1,4 MB | 61 ms |
| `GET /billings` | 780 KB | 22 ms |
| `GET /clients` | 604 KB | 25 ms |
| `GET /vehicles` | 581 KB | 35 ms |
| `GET /service-orders` | 356 KB | 16 ms |
| `GET /service-orders/metrics/average-execution-time` | 49 B | 21 ms |

A serialização das listagens sem paginação satura o event loop, e até rotas
pequenas entram na fila. `/notifications` sozinha responde por ~70% dos bytes.
Os patamares de 10k e 50k não foram medidos.

### Ainda não executados

- `load:soak` (45 min) com `watch-resources.sh`.
- `load:read` com `VOLUME=10000` e `VOLUME=50000`.
- `load:auth` com `PROFILE=spike`.
