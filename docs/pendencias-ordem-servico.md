# Pendências — Épico Ordem de Serviço (Tech Challenge)

> Comparação entre o PDF "15SOAT - Fase 1 - Tech Challenge" e o que está implementado em `src/modules/service-order`. Atualizar conforme o épico evolui.

## Fechado

- **Status "Entregue"** — `ServiceOrderStatus.DELIVERED`, transição `deliver()` só a partir de `COMPLETED`, terminal (sem cancelamento, sem novas transições).
- **"Monitoramento do tempo médio de execução dos serviços"** — `GET /api/v1/service-order/metrics/average-execution-time`, calculado como `completedAt - createdAt` sobre as OS finalizadas.
- Transições sequenciais de status (não pode pular etapa, ex: `IN_DIAGNOSIS → AWAITING_PARTS` direto, ou `COMPLETED → AWAITING_PARTS`) — já garantidas pela tabela `ALLOWED_TRANSITIONS` na entity, não no service.

## Fora de escopo (decisão de design documentada)

Ver `docs/superpowers/specs/2026-08-17-service-order-design.md` — excluído deliberadamente porque os módulos ainda não existem (epics futuros, "Integração dos Fluxos"):

- Cadastro de veículo (placa, marca, modelo, ano) — `vehicleId` é string opaca, sem validação de existência.
- Serviços solicitados estruturados (ex: troca de óleo, alinhamento) — hoje só `description` (texto livre).
- Peças e insumos com controle de estoque.
- Orçamento gerado automaticamente + fluxo de aprovação explícito do cliente (hoje só existe o status `AWAITING_APPROVAL`, sem objeto de orçamento nem endpoint de aprovar/reprovar).

## Pendente — gaps reais no épico de Ordem de Serviço

1. **Autenticação JWT nas APIs administrativas** — exigido explicitamente pelo PDF ("Segurança e qualidade"). Nenhum guard/auth existe no projeto hoje (não é exclusivo da OS, é transversal a toda a API).
2. **Cliente só consultar a própria OS** — decorre do item 1: sem auth, não há como restringir `GET /service-order/:id` / `GET /service-order` por dono. Hoje qualquer chamada vê qualquer OS.
3. **"Alteração automática dos status conforme ações no sistema"** — hoje toda transição é manual, via `PATCH` explícito (`start-diagnosis`, `await-approval`, etc). O PDF sugere que o próprio sistema dispare a mudança de status a partir de eventos (ex: diagnóstico concluído → aguardando aprovação automaticamente), o que dependeria dos módulos de Diagnóstico/Orçamento (fora de escopo hoje).

## Fora do épico de Ordem de Serviço (outros épicos do PDF, ainda não iniciados)

- CRUD de veículos.
- CRUD de serviços (catálogo).
- CRUD de peças e insumos, com controle de estoque.
- Orçamento automático baseado em serviços + peças.
- Autenticação JWT (transversal, não específica da OS).
