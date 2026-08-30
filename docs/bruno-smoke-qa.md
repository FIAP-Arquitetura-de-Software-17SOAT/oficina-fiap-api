# Bruno Smoke QA

Esta validacao roda a API como caixa-preta usando Bruno. Ela nao substitui `npm run test:e2e`; serve para QA externo, demonstracao e evidencia com relatorio.

## Fonte da colecao

A colecao Bruno e gerada a partir de TypeScript:

- `tools/bruno-smoke/flow.ts`: fluxo smoke.
- `tools/bruno-smoke/adapter.ts`: renderizacao `.bru`.
- `bruno/oficina-fiap-smoke`: saida gerada.

Edite TypeScript e rode:

```bash
npm run bruno:generate
```

## Gerar novos dados na Bruno UI

O request `00-gerar-dados` funciona como um botao. Rode ele sempre que quiser renovar os dados antes do fluxo.

Depois rode do `01-health-check` em diante, ou rode a colecao inteira.

## Dados dinamicos ou manuais

No environment `local`, a variavel `useRandomData` controla os dados:

- `true`: request `00-health-check` gera dados unicos por execucao.
- `false`: Bruno usa os valores preenchidos no environment.

Com `useRandomData: true`, o request `00-gerar-dados` gera:

- CNPJ valido.
- Nome, email e celular do cliente.
- Marca, modelo, ano e placa Mercosul do veiculo.
- Nome e descricao de servico.
- Codigo, nome e descricao de peca.
- Idempotency key de estoque.
- UUID externo de mecanico.

Os IDs de cliente, veiculo, servico, peca, OS, orcamento e cobranca sao capturados das respostas da API.

Para inserir dados manualmente pela Bruno UI:

1. Abra environment `local`.
2. Altere `useRandomData` para `false`.
3. Preencha `clientName`, `document`, `clientEmail`, `clientPhone`, `plate`, `vehicleBrand`, `vehicleModel`, `vehicleYear`, `serviceName`, `serviceDescription`, `partCode`, `partName`, `partDescription`, `serviceOrderDescription`, `budgetServiceDescription`, `budgetPartDescription` e `mechanicId`.
4. Rode request `00-gerar-dados` antes do fluxo para preparar variaveis.

Mesmo no modo manual, `stockIdempotencyKey` recebe sufixo por execucao para evitar conflito.

## Pre-requisitos

- API rodando em `http://localhost:3000/api/v1`.
- Banco migrado.
- Admin criado por seed.
- `ADMIN_EMAIL` e `ADMIN_PASSWORD` disponiveis no shell ou no arquivo `.env`.

## Executar smoke principal

```bash
npm run bruno:smoke
```

## Gerar relatorio

```bash
npm run bruno:smoke:report
```

Arquivos gerados:

- `reports/bruno/oficina-smoke.html`
- `reports/bruno/oficina-smoke.json`
- `reports/bruno/oficina-smoke.xml`

## Validar entrega paga opcional

O smoke principal para em cobranca gerada. A entrega depende de pagamento confirmado.

```bash
stripe listen --forward-to localhost:3000/api/v1/billings/stripe/webhook
stripe trigger checkout.session.completed
npm run bruno:smoke:optional-delivery
```

## O que Bruno nao cobre

- Falta de estoque.
- Orcamento recusado.
- Cancelamento de OS.
- Rotas removidas.
- Metricas internas.
- Detalhes de politicas entre agregados.

Esses cenarios pertencem a suite Jest E2E em `test/workshop-flow.e2e-spec.ts`.
