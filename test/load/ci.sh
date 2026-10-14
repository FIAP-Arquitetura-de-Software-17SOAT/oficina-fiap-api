#!/usr/bin/env bash
# Sobe o ambiente de carga, roda os cenários pedidos, guarda os relatórios e
# derruba tudo. Usado pelas workflows do GitHub Actions e também localmente:
#
#   test/load/ci.sh smoke
#   PROFILE=load test/load/ci.sh journey
#   ITERATIONS=50 test/load/ci.sh race:stock race:mechanic
#
# Os nomes são os scripts npm sem o prefixo `load:`. Todos os cenários rodam
# mesmo que um falhe; o código de saída é diferente de zero se algum falhou.
# Fora do CI, o `.env` precisa existir (o mesmo do docker compose). No CI
# (CI=true) e sem `.env`, um arquivo descartável é gerado: Stripe, SMTP e JWT
# são sobrescritos pelo docker-compose.load.yml, então nenhum segredo é usado.
set -uo pipefail

cd "$(dirname "$0")/../.." || exit 2

if [ "$#" -eq 0 ]; then
  echo "uso: $0 <cenário> [<cenário>...]  (ex.: smoke race:stock)" >&2
  exit 2
fi

results=test/load/results
mkdir -p "$results"

if [ ! -f .env ]; then
  if [ "${CI:-}" != "true" ]; then
    echo ".env não encontrado. Crie a partir do .env.sample." >&2
    exit 2
  fi
  cat > .env <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 16)
ADMIN_EMAIL=admin@load.test
ADMIN_PASSWORD=$(openssl rand -hex 16)
JWT_ACCESS_SECRET=overridden-by-docker-compose-load
JWT_REFRESH_SECRET=overridden-by-docker-compose-load
STRIPE_SECRET_KEY=sk_test_overridden
STRIPE_WEBHOOK_SECRET=whsec_overridden
PAYMENT_SUCCESS_URL=http://localhost:3000/api/v1/payment/success
PAYMENT_CANCEL_URL=http://localhost:3000/api/v1/payment/cancel
SMTP_HOST=mailpit
MAIL_FROM=oficina@load.test
EOF
fi

# O container do k6 grava com o UID do host (no runner do GitHub não é 1000).
export LOAD_UID="${LOAD_UID:-$(id -u)}"
export LOAD_GID="${LOAD_GID:-$(id -g)}"

compose=(docker compose -p oficina-load -f docker-compose.yml -f docker-compose.load.yml --profile load)

summary() {
  [ -n "${GITHUB_STEP_SUMMARY:-}" ] && printf '%s\n' "$@" >> "$GITHUB_STEP_SUMMARY"
  return 0
}

# shellcheck disable=SC2329 # chamada pelo trap EXIT
teardown() {
  "${compose[@]}" logs --no-color > "$results/compose.log" 2>&1 || true
  npm run --silent load:down > /dev/null 2>&1 || true
}
trap teardown EXIT

if ! npm run --silent load:up; then
  summary "### ❌ Ambiente de carga não subiu" "Veja \`compose.log\` nos artefatos."
  exit 1
fi

status=0
summary "## k6 — $(git rev-parse --short HEAD)" ""
for scenario in "$@"; do
  file="$results/${scenario//:/-}.txt"
  echo "::group::k6 $scenario"
  npm run --silent "load:$scenario" 2>&1 | tee "$file"
  rc=${PIPESTATUS[0]}
  echo "::endgroup::"

  if [ "$rc" -eq 0 ]; then
    summary "### ✅ $scenario"
  else
    status=1
    summary "### ❌ $scenario (k6 saiu com $rc)"
  fi
  # Thresholds e totais, sem as linhas de progresso.
  summary '```' "$(sed -n '/█ THRESHOLDS/,/█ TOTAL RESULTS/p' "$file" | sed '$d')" '```' ""
  if grep -q "level=error" "$file"; then
    summary "<details><summary>Erros registrados</summary>" "" '```' \
      "$(grep "level=error" "$file" | head -20)" '```' "</details>" ""
  fi
done

exit "$status"
