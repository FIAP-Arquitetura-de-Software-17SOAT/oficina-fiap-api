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

Preencha após cada medição, com data, commit e máquina.

| Data | Commit | Cenário | Resultado |
| --- | --- | --- | --- |
| — | — | — | — |
