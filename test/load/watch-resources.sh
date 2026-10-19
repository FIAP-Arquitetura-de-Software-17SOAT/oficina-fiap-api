#!/bin/sh
# Amostra CPU e memória dos containers da carga a cada INTERVAL segundos e
# grava em test/load/results/resources-<data>.csv. Rode em paralelo com o
# soak e interrompa com Ctrl+C ao final.
set -eu

INTERVAL=${INTERVAL:-60}
CONTAINERS=${CONTAINERS:-"oficina-fiap-api oficina-fiap-postgres"}
dir="$(dirname "$0")/results"
mkdir -p "$dir"
out="$dir/resources-$(date +%Y%m%d-%H%M%S).csv"

echo "timestamp,container,cpu_percent,mem_usage,mem_percent" > "$out"
echo "Gravando em $out (Ctrl+C para parar)"

while true; do
  now=$(date -Iseconds)
  # shellcheck disable=SC2086
  docker stats --no-stream --format "{{.Name}},{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}}" $CONTAINERS |
    sed "s/^/$now,/" >> "$out"
  sleep "$INTERVAL"
done
