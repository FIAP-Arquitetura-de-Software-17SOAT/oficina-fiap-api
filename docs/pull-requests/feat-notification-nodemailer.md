## 📝 Resumo

Adiciona a infraestrutura reutilizável de envio de e-mails com Nodemailer. O módulo disponibiliza um contrato de e-mail para os módulos de negócio, mantendo a configuração SMTP e o adaptador fora dos fluxos de orçamento e cobrança.

## 🔧 Alterações

- Adiciona `nodemailer` e suas definições de tipo ao projeto.
- Cria o contrato `EmailSender`, o adaptador `NodemailerEmailSender` e o `EmailModule` compartilhado.
- Configura o transporte SMTP a partir de variáveis de ambiente, incluindo autenticação opcional e remetente configurável.
- Inclui testes unitários do módulo e do adaptador, além do documento de desenho da solução de notificações.

## 🏷️ Tipo de mudança

- [x] Feature
- [ ] Bug fix
- [ ] Refactor
- [x] Testes
- [x] Documentação
- [x] Configuração/infra

## ✅ Como testar

- [x] `npm test -- --runInBand`
- [x] `npm run test:e2e -- --runInBand`
- [x] `npm run build`

As verificações foram executadas após recriar as dependências com `npm ci`.

## 👀 Observações

- Este PR é a primeira camada da pilha e deve ter `main` como base.
- Não contém disparos de regra de negócio; os consumidores de orçamento, cobrança e estoque ficam no PR subsequente.
- Para a demonstração local, Ethereal ou Mailpit podem ser usados como servidor SMTP de teste.
- O `EmailModule` importa explicitamente `ConfigModule`; isso permite que o adaptador receba `ConfigService` também quando o módulo é testado isoladamente.

## 📋 Checklist

- [x] A mudança está coerente com o escopo do PR
- [x] Testes foram adicionados ou atualizados quando necessário
- [x] A documentação/Swagger foi atualizada quando aplicável
- [x] Impactos em Prisma/schema/migrations foram avaliados quando aplicável
- [x] Foram avaliados riscos de regressão ou efeitos colaterais
