#!/bin/sh
# Os container_name do docker-compose.yml são fixos: a stack de carga não sobe
# enquanto a de desenvolvimento (ou prod-like) estiver de pé.
set -eu

project=$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' oficina-fiap-api 2>/dev/null || true)

if [ -n "$project" ] && [ "$project" != "oficina-load" ]; then
  echo "A stack '$project' está usando os containers oficina-fiap-*." >&2
  echo "Derrube-a antes dos testes de carga: npm run docker:down" >&2
  exit 1
fi

mkdir -p "$(dirname "$0")/results"
