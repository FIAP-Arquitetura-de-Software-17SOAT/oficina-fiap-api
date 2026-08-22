## Resumo

Adiciona o dominio `Billing` para gerar cobrancas de ordens de servico concluidas, registrar pagamentos e liberar a entrega somente apos a quitacao da cobranca.

## Alteracoes

- Cria o agregado `Billing`, entidade interna `Payment`, enums de status/metodo de pagamento e value object para valor de pagamento.
- Adiciona schema/migration Prisma para `billing` e `billing_payment`, repository, mapper, service, controller e modulo Nest.
- Integra Billing com `ServiceOrder` e `Budget`, usando o orcamento aceito mais recente como base da cobranca.
- Remove a rota direta de entrega da OS para evitar bypass sem pagamento e passa a liberar entrega pelo fluxo de Billing.
- Adiciona controle de concorrencia otimista em atualizacoes de Billing para evitar perda de pagamentos.
- Adiciona testes unitarios e e2e para geracao de cobranca, pagamentos, concorrencia, entrega bloqueada sem pagamento e preservacao do orcamento aceito.

## Tipo de mudanca

- [x] Feature
- [x] Bug fix
- [ ] Refactor
- [x] Testes
- [x] Documentacao
- [x] Configuracao/infra

## Como testar

- [x] `npm test`
- [x] `npm run build`
- [x] `npx prisma validate`
- [x] `npx jest --config ./test/jest-e2e.json billing.e2e-spec.ts`
- [x] `npx jest --config ./test/jest-e2e.json service-order.e2e-spec.ts swagger.e2e-spec.ts`

## Observacoes

- `npm run test:e2e` usa sintaxe POSIX para variavel de ambiente e nao roda diretamente no Windows; foi usado o fallback direto com `npx jest --config ./test/jest-e2e.json ...`.
- A migration foi gerada e validada estaticamente, mas ainda precisa ser aplicada e validada contra um PostgreSQL real. Nesta maquina, Docker/Postgres nao estava disponivel e `prisma migrate status` falhou contra `localhost:5432` com `Schema engine error`.

## Checklist

- [x] A mudanca esta coerente com o escopo do PR
- [x] Testes foram adicionados ou atualizados quando necessario
- [x] A documentacao/Swagger foi atualizada quando aplicavel
- [x] Impactos em Prisma/schema/migrations foram avaliados quando aplicavel
- [x] Foram avaliados riscos de regressao ou efeitos colaterais
