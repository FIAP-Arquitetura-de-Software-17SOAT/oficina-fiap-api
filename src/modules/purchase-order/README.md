# Purchase Order

Este módulo implementa o agregado **Pedido de Compra (`PurchaseOrder`)** da aplicação da oficina mecânica.

O objetivo do módulo é representar o processo de compra de peças e insumos junto a fornecedores quando houver necessidade de reposição, mantendo as regras de domínio e o ciclo de vida do pedido dentro do próprio agregado.

A implementação segue os princípios de DDD adotados no projeto, com separação entre domínio, aplicação, persistência e API HTTP.

---

## Visão geral

O `PurchaseOrder` representa um pedido realizado pela oficina junto a um fornecedor.

O agregado possui uma coleção de itens, em que cada item referencia uma peça ou insumo por meio de `pecaId`.

O fluxo principal é:

```text
NECESSITA_COMPRA
        ↓
registrarCompra()
        ↓
AGUARDANDO_ENTREGA
        ↓
marcarComoEntregue()
        ↓
ENTREGUE
```

O pedido pode ser alterado enquanto estiver em `NECESSITA_COMPRA`.

Após o registro da compra junto ao fornecedor, os itens não podem mais ser adicionados ou removidos.

`ENTREGUE` é o estado final do pedido.

---

# Estrutura do módulo

```text
src/modules/purchase-order/
├── controllers/
│   ├── purchase-order.controller.ts
│   └── purchase-order.controller.spec.ts
│
├── dto/
│   └── purchase-order.dto.ts
│
├── entities/
│   ├── purchase-order.entity.ts
│   ├── purchase-order.entity.spec.ts
│   ├── purchase-order-item.entity.ts
│   └── purchase-order-item.entity.spec.ts
│
├── enums/
│   └── purchase-order-status.enum.ts
│
├── mappers/
│   └── purchase-order.mapper.ts
│
├── repositories/
│   └── purchase-order.repository.ts
│
├── services/
│   ├── purchase-order.service.ts
│   └── purchase-order.service.spec.ts
│
├── value-objects/
│   ├── money.vo.ts
│   ├── money.vo.spec.ts
│   ├── purchase-order-number.vo.ts
│   ├── purchase-order-number.vo.spec.ts
│   ├── quantity.vo.ts
│   └── quantity.vo.spec.ts
│
└── purchase-order.module.ts
```

---

# Modelo de domínio

## PurchaseOrder

`PurchaseOrder` é a **Aggregate Root** do módulo.

Principais propriedades:

```text
id
number
supplier
status
items
createdAt
updatedAt
deliveredAt
```

Responsabilidades principais:

```text
addItem()
removeItem()
registerPurchase()
markAsDelivered()
getTotal()
```

A entidade também é responsável por garantir as transições permitidas entre os estados do pedido.

---

## PurchaseOrderItem

`PurchaseOrderItem` é uma entidade interna do agregado.

Propriedades:

```text
id
pecaId
quantity
unitPrice
```

O item não armazena o subtotal diretamente.

O valor é calculado através de:

```text
subtotal = quantity × unitPrice
```

através do método:

```typescript
getSubtotal()
```

`pecaId` representa apenas uma referência à peça ou insumo existente no contexto de estoque.

O objeto completo de `Peca` não pertence ao agregado `PurchaseOrder`.

---

# Value Objects

## PurchaseOrderNumber

Representa o número legível do pedido.

Formato esperado:

```text
PC-AAAA-NNNN
```

Exemplo:

```text
PC-2026-0042
```

Responsabilidades:

* normalizar o valor;
* validar o formato;
* evitar números de pedido inválidos dentro do domínio.

---

## Quantity

Representa a quantidade de um item do pedido.

Regras:

```text
deve ser inteiro
deve ser maior que zero
```

Exemplos válidos:

```text
1
2
10
```

Exemplos inválidos:

```text
0
-1
1.5
```

---

## Money

Representa valores monetários.

Internamente, os valores são armazenados em **centavos inteiros**.

Exemplo:

```text
R$ 150,50
```

é representado como:

```text
15050
```

Isso evita problemas de precisão comuns em operações com ponto flutuante.

O Value Object também possui operações como:

```text
add()
multiply()
```

utilizadas para o cálculo dos subtotais e do total do pedido.

---

# Status do pedido

Os estados disponíveis são definidos em:

```typescript
PurchaseOrderStatus
```

com os valores:

```text
NECESSITA_COMPRA
AGUARDANDO_ENTREGA
ENTREGUE
```

## NECESSITA_COMPRA

Estado inicial de um pedido.

Enquanto estiver nesse estado:

* itens podem ser adicionados;
* itens podem ser removidos;
* a compra pode ser registrada caso exista pelo menos um item.

---

## AGUARDANDO_ENTREGA

Indica que a compra já foi registrada junto ao fornecedor.

A partir desse momento:

* itens não podem mais ser adicionados;
* itens não podem mais ser removidos;
* o pedido pode ser marcado como entregue.

---

## ENTREGUE

Estado final do pedido.

Ao atingir esse estado:

```text
deliveredAt
```

é preenchido.

Nenhuma nova transição de estado é permitida.

---

# Invariantes de domínio

O agregado protege as seguintes regras:

### Pedido sem itens não pode ser registrado

Não é permitido executar:

```typescript
registerPurchase()
```

caso:

```text
items.length === 0
```

---

### Quantidade deve ser maior que zero

A regra é protegida pelo Value Object:

```typescript
Quantity
```

---

### Transições de status devem respeitar a ordem

Permitido:

```text
NECESSITA_COMPRA
        ↓
AGUARDANDO_ENTREGA
        ↓
ENTREGUE
```

Não permitido:

```text
NECESSITA_COMPRA → ENTREGUE
```

nem:

```text
ENTREGUE → AGUARDANDO_ENTREGA
```

---

### Pedido não pode ser alterado após registro da compra

Após:

```typescript
registerPurchase()
```

as operações:

```typescript
addItem()
removeItem()
```

são recusadas pelo domínio.

---

### ENTREGUE é terminal

Depois que o pedido atingir:

```text
ENTREGUE
```

nenhuma nova alteração ou transição é permitida.

---

# API REST

O módulo disponibiliza os seguintes endpoints.

## Criar pedido

```http
POST /api/v1/purchase-orders
```

Exemplo:

```json
{
  "number": "PC-2026-0042",
  "supplier": "Auto Peças São Paulo"
}
```

O pedido é criado inicialmente como:

```text
NECESSITA_COMPRA
```

---

## Listar pedidos

```http
GET /api/v1/purchase-orders
```

Retorna os pedidos cadastrados e seus respectivos itens.

---

## Buscar pedido por ID

```http
GET /api/v1/purchase-orders/{id}
```

---

## Adicionar item

```http
POST /api/v1/purchase-orders/{id}/items
```

Exemplo:

```json
{
  "pecaId": "550e8400-e29b-41d4-a716-446655440000",
  "quantity": 2,
  "unitPrice": 150.5
}
```

A operação só é permitida enquanto o pedido estiver em:

```text
NECESSITA_COMPRA
```

---

## Remover item

```http
DELETE /api/v1/purchase-orders/{id}/items/{itemId}
```

Também só é permitido enquanto o pedido estiver em:

```text
NECESSITA_COMPRA
```

---

## Registrar compra

```http
PATCH /api/v1/purchase-orders/{id}/register-purchase
```

Executa a transição:

```text
NECESSITA_COMPRA
        ↓
AGUARDANDO_ENTREGA
```

O pedido precisa possuir pelo menos um item.

---

## Registrar entrega

```http
PATCH /api/v1/purchase-orders/{id}/deliver
```

Executa:

```text
AGUARDANDO_ENTREGA
        ↓
ENTREGUE
```

e registra:

```text
deliveredAt
```

---

# Persistência

O módulo utiliza **Prisma ORM + PostgreSQL**.

Os models utilizados são:

```text
PurchaseOrder
PurchaseOrderItem
```

Exemplo simplificado:

```prisma
model PurchaseOrder {
  id          String   @id @default(uuid())
  number      String   @unique
  supplier    String
  status      String

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  deliveredAt DateTime?

  items PurchaseOrderItem[]

  @@map("purchase_order")
}

model PurchaseOrderItem {
  id              String @id @default(uuid())
  purchaseOrderId String
  pecaId           String
  quantity         Int
  unitPriceCents   Int

  purchaseOrder PurchaseOrder @relation(
    fields: [purchaseOrderId],
    references: [id],
    onDelete: Cascade
  )

  @@map("purchase_order_item")
}
```

Na implementação real, a declaração `@relation` deve permanecer no formato aceito pelo schema Prisma utilizado no projeto.

---

# Valores derivados

Os seguintes valores não são armazenados diretamente no banco.

## Subtotal do item

```text
quantity × unitPrice
```

Calculado através de:

```typescript
PurchaseOrderItem.getSubtotal()
```

---

## Total do pedido

```text
soma de todos os subtotais
```

Calculado por:

```typescript
PurchaseOrder.getTotal()
```

Isso evita inconsistências entre valores persistidos e valores reais dos itens.

---

# Repository

`PurchaseOrderRepository` é responsável pela persistência do agregado.

Principais operações:

```typescript
create()
findAll()
findById()
update()
```

O repository também realiza a reconstrução do agregado a partir dos registros retornados pelo Prisma.

As regras de negócio não ficam no repository.

Por exemplo, o repository não decide se um pedido pode ser entregue.

Essa responsabilidade permanece em:

```typescript
PurchaseOrder.markAsDelivered()
```

---

# Service

`PurchaseOrderService` atua como camada de orquestração.

Exemplo:

```text
Controller
   ↓
PurchaseOrderService
   ↓
PurchaseOrder
   ↓
PurchaseOrderRepository
   ↓
Prisma
   ↓
PostgreSQL
```

O service realiza operações como:

```typescript
create()
findAll()
findById()
addItem()
removeItem()
registerPurchase()
markAsDelivered()
```

As regras de negócio continuam dentro do agregado.

---

# Mapper

`PurchaseOrderMapper` converte o agregado para o formato retornado pela API.

Além das propriedades persistidas, o mapper expõe valores derivados, como:

```text
subtotal
total
```

Exemplo de retorno:

```json
{
  "id": "uuid",
  "number": "PC-2026-0042",
  "supplier": "Auto Peças São Paulo",
  "status": "NECESSITA_COMPRA",
  "items": [
    {
      "id": "uuid",
      "pecaId": "uuid",
      "quantity": 2,
      "unitPrice": 150.5,
      "subtotal": 301
    }
  ],
  "total": 301,
  "createdAt": "2026-08-18T20:00:00.000Z",
  "updatedAt": "2026-08-18T20:00:00.000Z",
  "deliveredAt": null
}
```

---

# Swagger

Com a aplicação em execução, a documentação pode ser acessada em:

```text
http://localhost:3000/api/v1/docs
```

Os endpoints ficam agrupados na seção:

```text
Purchase Orders
```

---

# Testes

O módulo possui testes unitários para:

```text
Money
Quantity
PurchaseOrderNumber
PurchaseOrderItem
PurchaseOrder
PurchaseOrderService
PurchaseOrderController
```

As principais regras testadas incluem:

* criação de quantidades válidas;
* rejeição de quantidade zero ou negativa;
* armazenamento de dinheiro em centavos;
* cálculo do subtotal;
* cálculo do total;
* criação do pedido em `NECESSITA_COMPRA`;
* adição e remoção de itens;
* impossibilidade de registrar compra sem itens;
* transição para `AGUARDANDO_ENTREGA`;
* bloqueio de alterações após registro da compra;
* transição para `ENTREGUE`;
* comportamento terminal de `ENTREGUE`;
* busca de pedido inexistente.

Para executar:

```bash
npm test
```

Para executar apenas os testes relacionados ao módulo:

```bash
npm test -- purchase-order
```

Para cobertura:

```bash
npm run test:cov
```

No estado atual da implementação, a suíte completa do projeto executou com sucesso:

```text
16 test suites passed
145 tests passed
```

---

# Executando o projeto

## Gerar Prisma Client

```bash
npx prisma generate
```

## Validar schema

```bash
npx prisma validate
```

## Aplicar migrations em desenvolvimento

```bash
npx prisma migrate dev
```

## Build

```bash
npm run build
```

## Executar com Docker

```bash
docker compose up -d --build
```

## Verificar containers

```bash
docker compose ps
```

---

# Visualizando os dados

O banco pode ser visualizado através do Prisma Studio:

```bash
npx prisma studio
```

Por padrão:

```text
http://localhost:5555
```

Os models:

```text
PurchaseOrder
PurchaseOrderItem
```

podem ser consultados diretamente pela interface.

---

# Integração futura com Estoque

A chegada de um pedido deve futuramente provocar reposição da peça ou insumo correspondente no estoque.

O fluxo esperado é:

```text
PurchaseOrder
     ↓
ENTREGUE
     ↓
evento / application service
     ↓
Peca.repor()
     ↓
estoque atualizado
```

Essa atualização **não deve ser feita diretamente dentro de `PurchaseOrder` ou através de chamada ao `PecaRepository` pelo agregado**.

`PurchaseOrder` e `Peca` são agregados diferentes.

A integração deve ser realizada através de:

```text
Domain Event + Handler
```

ou, para um MVP:

```text
Application Service
```

responsável por orquestrar os dois agregados.

Isso preserva o desacoplamento entre os contextos e mantém as responsabilidades do domínio bem definidas.

---

# Fluxo funcional completo

```text
Peça/insumo necessita de compra
              ↓
      PurchaseOrder criado
              ↓
       NECESSITA_COMPRA
              ↓
        adicionarItem()
              ↓
       registrarCompra()
              ↓
     AGUARDANDO_ENTREGA
              ↓
      markAsDelivered()
              ↓
           ENTREGUE
              ↓
       integração futura
              ↓
          Peca.repor()
```

O módulo `PurchaseOrder` é responsável até o estado `ENTREGUE`.

A atualização efetiva do estoque pertence à integração entre os agregados.