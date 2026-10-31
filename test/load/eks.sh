#!/usr/bin/env bash
# Roda o cenário `auth` contra a API no EKS e registra, enquanto isso, as
# réplicas e o consumo que o HPA enxerga. Usado pela workflow "Carga: escala
# no EKS" e também localmente, com o kubeconfig do cluster:
#
#   aws eks update-kubeconfig --region us-east-1 --name <cluster>
#   PROFILE=stress test/load/eks.sh
#
# Só o `auth` roda aqui: `journey`, `webhook` e `customer` chamam o Stripe ou o
# SMTP de produção. O setup cria ACCOUNTS clientes "Cliente Carga" no banco de
# produção, que ficam lá depois do teste.
#
# Variáveis (vazio = padrão):
#   PROFILE           smoke | stress | spike (stress)
#   ACCOUNTS          contas de cliente criadas no setup (20)
#   COOLDOWN_MINUTES  minutos acompanhando a descida após a carga (8)
#   INTERVAL          segundos entre amostras do HPA (10)
#   BASE_URL          endereço da API (padrão: o do Service LoadBalancer)
#   ADMIN_EMAIL, ADMIN_PASSWORD  (padrão: Secret oficina-seed-secrets)
#
# Sai com erro se o ambiente não estiver pronto ou se o HPA não escalar (fora do
# smoke, que é leve demais para isso). Os
# thresholds do k6 só aparecem no resumo: no stress, reprovar é esperado.
set -uo pipefail

cd "$(dirname "$0")/../.." || exit 2

NAMESPACE=${NAMESPACE:-oficina}
PROFILE=${PROFILE:-stress}
ACCOUNTS=${ACCOUNTS:-20}
COOLDOWN_MINUTES=${COOLDOWN_MINUTES:-8}
INTERVAL=${INTERVAL:-10}

case "$PROFILE" in
  smoke | stress | spike) ;;
  *) echo "PROFILE=$PROFILE inválido. Use smoke, stress ou spike." >&2; exit 2 ;;
esac
for var in ACCOUNTS COOLDOWN_MINUTES INTERVAL; do
  if [[ ! "${!var}" =~ ^[0-9]+$ ]]; then
    echo "$var precisa ser um número inteiro (recebido: '${!var}')." >&2
    exit 2
  fi
done
if [ "$ACCOUNTS" -lt 1 ] || [ "$ACCOUNTS" -gt 200 ]; then
  echo "ACCOUNTS precisa estar entre 1 e 200." >&2
  exit 2
fi
if [ "$COOLDOWN_MINUTES" -gt 30 ]; then
  echo "COOLDOWN_MINUTES vai até 30." >&2
  exit 2
fi
[ "$INTERVAL" -ge 5 ] || INTERVAL=5

results=test/load/results
mkdir -p "$results"
timeline="$results/eks-hpa.csv"
phase_file="$results/.eks-phase"
k6_out="$results/eks-auth-$PROFILE.txt"

k() { kubectl -n "$NAMESPACE" "$@"; }

summary() {
  [ -n "${GITHUB_STEP_SUMMARY:-}" ] && printf '%s\n' "$@" >> "$GITHUB_STEP_SUMMARY"
  return 0
}

fail() {
  echo "$1" >&2
  summary "### ❌ $1"
  exit 1
}

# --- Ambiente -----------------------------------------------------------------

if [ -z "${BASE_URL:-}" ]; then
  host=$(k get service oficina-api -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null)
  [ -n "$host" ] || fail "O Service oficina-api não tem endereço externo (EXTERNAL-IP pendente?)."
  BASE_URL="http://$host"
fi
BASE_URL=${BASE_URL%/}

# Mesmas credenciais que o Job de seed usou para criar o administrador.
seed_secret() {
  k get secret oficina-seed-secrets -o "jsonpath={.data.$1}" 2>/dev/null | base64 -d
}
ADMIN_EMAIL=${ADMIN_EMAIL:-$(seed_secret ADMIN_EMAIL)}
ADMIN_PASSWORD=${ADMIN_PASSWORD:-$(seed_secret ADMIN_PASSWORD)}
if [ -n "${GITHUB_ACTIONS:-}" ]; then
  echo "::add-mask::$ADMIN_EMAIL"
  echo "::add-mask::$ADMIN_PASSWORD"
fi
[ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD" ] ||
  fail "Credenciais do admin não encontradas (Secret oficina-seed-secrets)."

curl -fsS --max-time 10 -o /dev/null "$BASE_URL/health" ||
  fail "A API não respondeu em $BASE_URL/health."

metrics=$(k get hpa oficina-api -o jsonpath='{.status.currentMetrics[*].resource.current.averageUtilization}' 2>/dev/null)
[ -n "$metrics" ] || fail "O HPA ainda não tem métricas (Metrics Server instalado?)."

min_replicas=$(k get hpa oficina-api -o jsonpath='{.spec.minReplicas}')
max_replicas=$(k get hpa oficina-api -o jsonpath='{.spec.maxReplicas}')
start_replicas=$(k get hpa oficina-api -o jsonpath='{.status.currentReplicas}')

# --- Monitor ------------------------------------------------------------------

# Uma linha por amostra no CSV e no log, marcada com a fase em que o teste está.
sample() {
  local phase hpa current desired cpu mem ready pending
  phase=$(cat "$phase_file" 2>/dev/null || echo "?")
  hpa=$(k get hpa oficina-api -o jsonpath='{.status.currentReplicas} {.status.desiredReplicas} {.status.currentMetrics[?(@.resource.name=="cpu")].resource.current.averageUtilization} {.status.currentMetrics[?(@.resource.name=="memory")].resource.current.averageUtilization}' 2>/dev/null)
  read -r current desired cpu mem <<< "$hpa"
  ready=$(k get pods -l app=oficina-api -o jsonpath='{range .items[*]}{.status.conditions[?(@.type=="Ready")].status}{"\n"}{end}' 2>/dev/null | grep -c True)
  pending=$(k get pods -l app=oficina-api --field-selector=status.phase=Pending --no-headers 2>/dev/null | wc -l)
  echo "$(date -u +%H:%M:%S),$phase,${current:-},${desired:-},${cpu:-},${mem:-},$ready,$pending" >> "$timeline"
  echo "[hpa $(date -u +%H:%M:%S) $phase] réplicas ${current:-?}→${desired:-?} · CPU ${cpu:-?}% · memória ${mem:-?}% · prontos $ready · pendentes $pending"
}

echo "time_utc,phase,current_replicas,desired_replicas,cpu_percent,memory_percent,ready_pods,pending_pods" > "$timeline"
echo baseline > "$phase_file"
( while true; do sample; sleep "$INTERVAL"; done ) &
monitor=$!

# shellcheck disable=SC2329 # chamada pelo trap EXIT
teardown() {
  kill "$monitor" 2>/dev/null || true
  rm -f "$phase_file"
  k describe hpa oficina-api > "$results/eks-hpa-describe.txt" 2>&1 || true
  k get events --sort-by=.lastTimestamp > "$results/eks-events.txt" 2>&1 || true
}
trap teardown EXIT

echo "Alvo: $BASE_URL · perfil $PROFILE · $ACCOUNTS contas · HPA $min_replicas–$max_replicas réplicas (agora $start_replicas)"
sleep 30

# --- Carga --------------------------------------------------------------------

echo load > "$phase_file"
export BASE_URL ADMIN_EMAIL ADMIN_PASSWORD PROFILE ACCOUNTS
docker run --rm --user "$(id -u):$(id -g)" \
  -v "$PWD/test/load:/load" -w /load \
  -e BASE_URL -e ADMIN_EMAIL -e ADMIN_PASSWORD -e PROFILE -e ACCOUNTS \
  grafana/k6:2.3.0 run scenarios/auth-load.js 2>&1 | tee "$k6_out"
k6_rc=${PIPESTATUS[0]}

echo cooldown > "$phase_file"
echo "Carga encerrada (k6 saiu com $k6_rc). Acompanhando a descida por $COOLDOWN_MINUTES min."
sleep $((COOLDOWN_MINUTES * 60))
sample > /dev/null

# --- Resumo -------------------------------------------------------------------

peak=$(awk -F, 'NR > 1 && $3 > max { max = $3 } END { print max + 0 }' "$timeline")
end_replicas=$(tail -n 1 "$timeline" | cut -d, -f3)
peak_cpu=$(awk -F, 'NR > 1 && $5 > max { max = $5 } END { print max + 0 }' "$timeline")
max_pending=$(awk -F, 'NR > 1 && $8 > max { max = $8 } END { print max + 0 }' "$timeline")

summary "## Escala no EKS — perfil \`$PROFILE\`, $ACCOUNTS contas" "" \
  "| Réplicas no início | Pico | No fim | CPU máxima (% do request) | Pods Pending (máx.) |" \
  "| --- | --- | --- | --- | --- |" \
  "| $start_replicas | $peak de $max_replicas | $end_replicas | $peak_cpu% | $max_pending |" "" \
  "### Mudanças de réplicas" "" \
  "| Hora (UTC) | Fase | Réplicas | Desejadas | CPU % | Memória % | Prontos | Pending |" \
  "| --- | --- | --- | --- | --- | --- | --- | --- |" \
  "$(awk -F, 'NR > 1 && (key = $3 "/" $4 "/" $7 "/" $8) != last { print "| " $1 " | " $2 " | " $3 " | " $4 " | " $5 " | " $6 " | " $7 " | " $8 " |"; last = key }' "$timeline")" ""

if [ "$k6_rc" -eq 0 ]; then
  summary "### ✅ k6 auth ($PROFILE): thresholds aprovados"
else
  summary "### ⚠️ k6 auth ($PROFILE): thresholds reprovados (k6 saiu com $k6_rc)" \
    "Esperado no stress e no spike: a carga passa da capacidade dos Pods de propósito."
fi
summary '```' "$(sed -n '/█ THRESHOLDS/,/█ TOTAL RESULTS/p' "$k6_out" | sed '$d')" '```' ""

if [ "$PROFILE" != smoke ] && [ "$peak" -le "$start_replicas" ] && [ "$start_replicas" -lt "$max_replicas" ]; then
  fail "O HPA não escalou: ficou em $start_replicas réplica(s)."
fi
echo "Pico de $peak réplicas (de $start_replicas); terminou com $end_replicas."
