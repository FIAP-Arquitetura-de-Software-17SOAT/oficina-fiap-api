# Infraestrutura com Terraform - guia para iniciantes

Este guia explica, sem pressupor experiencia com Terraform, o que existe na
pasta [`infra/`](../../infra), quais recursos ela cria na AWS (um por um), como
o trabalho foi feito e como aplicar e destruir o ambiente.

Para a referencia curta (comandos e outputs), veja
[infra/README.md](../../infra/README.md).

## Sumario

1. [Conceitos basicos](#1-conceitos-basicos)
2. [O que foi pedido e o que foi entregue](#2-o-que-foi-pedido-e-o-que-foi-entregue)
3. [Visao geral da arquitetura](#3-visao-geral-da-arquitetura)
4. [Organizacao dos arquivos](#4-organizacao-dos-arquivos)
5. [Recursos criados, um por um](#5-recursos-criados-um-por-um)
6. [Variaveis e outputs](#6-variaveis-e-outputs)
7. [Como o trabalho foi feito](#7-como-o-trabalho-foi-feito)
8. [Passo a passo para aplicar](#8-passo-a-passo-para-aplicar)
9. [Passo a passo para destruir](#9-passo-a-passo-para-destruir)
10. [Problemas comuns](#10-problemas-comuns)
11. [Glossario](#11-glossario)

---

## 1. Conceitos basicos

### O que e Terraform

Terraform e uma ferramenta de **Infraestrutura como Codigo (IaC)**. Em vez de
criar servidores, redes e bancos clicando no console da AWS, voce descreve o
que quer em arquivos de texto (`.tf`), e o Terraform cria, altera ou apaga os
recursos para que a nuvem fique igual ao que esta escrito.

Vantagens:

- O ambiente e **reproduzivel**: qualquer pessoa do grupo cria o mesmo
  ambiente com os mesmos comandos.
- A infraestrutura fica **versionada no git**, com historico e revisao em PR.
- Da para **destruir tudo** com um comando quando nao estiver usando, e
  recriar depois (importante para nao gastar dinheiro).

### Linguagem HCL

Os arquivos `.tf` usam a linguagem HCL. Um recurso tem esta forma:

```hcl
resource "aws_ecr_repository" "this" {
  name = "oficina-api"
}
```

- `resource` diz que queremos criar algo.
- `"aws_ecr_repository"` e o **tipo** do recurso (aqui, um repositorio de
  imagens Docker na AWS).
- `"this"` e o **nome interno** usado para referenciar o recurso em outros
  arquivos (`aws_ecr_repository.this`).
- Dentro das chaves ficam as configuracoes.

### Provider

O **provider** e o plugin que sabe conversar com uma nuvem ou servico. Aqui
usamos:

- `hashicorp/aws` (versao 6.69.1): cria recursos na AWS.
- `hashicorp/random` (versao 3.9.1): gera a senha aleatoria do banco.

O provider AWS esta configurado em [`infra/providers.tf`](../../infra/providers.tf)
com a regiao `us-east-1` e com **tags padrao** (`Project = oficina-fiap`,
`ManagedBy = terraform`) aplicadas em todo recurso, o que facilita achar e
custear o que o projeto criou.

### Modulo

Um **modulo** e um pacote de codigo Terraform reutilizavel. Em vez de escrever
centenas de linhas para montar um cluster EKS, usamos modulos prontos e muito
usados da comunidade `terraform-aws-modules`:

| Modulo | Versao | O que monta |
| --- | --- | --- |
| `terraform-aws-modules/vpc/aws` | 6.7.3 | Rede (VPC, subnets, NAT, rotas) |
| `terraform-aws-modules/eks/aws` | 21.29.0 | Cluster Kubernetes e nos |
| `terraform-aws-modules/rds/aws` | 7.2.2 | Banco PostgreSQL |

As versoes sao fixas para que todos usem exatamente o mesmo codigo.

### State (estado)

O Terraform guarda em um arquivo chamado **state** a lista do que ele ja
criou e os IDs reais na AWS. E assim que ele sabe, na proxima execucao, o
que precisa mudar. O state deste projeto fica em um **bucket S3** (veja o
item 5.1), para que varias pessoas e maquinas usem o mesmo state. O state
contem a senha do banco, por isso o bucket e privado e criptografado.

### Os comandos principais

| Comando | O que faz |
| --- | --- |
| `terraform init` | Baixa providers e modulos e conecta ao state remoto. Roda uma vez por pasta (ou quando muda versao/modulo). |
| `terraform plan` | Mostra o que **seria** criado, alterado ou apagado. Nao muda nada. |
| `terraform apply` | Executa o plano e cria/altera os recursos de verdade. |
| `terraform destroy` | Apaga tudo o que o Terraform criou. |
| `terraform output` | Mostra os valores de saida (nome do cluster, URL do banco etc.). |
| `terraform test` | Roda os testes automatizados da configuracao. |

### Variavel, local e output

- **Variavel** (`variable`): parametro que pode ser trocado sem editar o
  codigo, por exemplo o tipo de maquina dos nos. Valores padrao em
  [`infra/variables.tf`](../../infra/variables.tf); para trocar, use
  `infra/terraform.tfvars`.
- **Local** (`locals`): valor calculado dentro do codigo, usado para dar
  nome a uma decisao (ex.: o nome do cluster `oficina-fiap-eks`).
- **Output**: valor exibido depois do apply e consumido por outras pessoas ou
  pela pipeline (ex.: a `DATABASE_URL`).

### Data source (bloco `data`)

Um bloco `resource` **cria** algo. Um bloco `data` (chamado *data source*)
apenas **consulta** algo que ja existe e devolve o resultado para ser usado
no codigo. Ele nunca cria, altera ou apaga nada na AWS, e por isso nao entra
na contagem "86 to add" do plano nem e removido no `destroy`.

```hcl
data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
}
```

- `data` diz que e uma consulta.
- `"aws_caller_identity"` e o **tipo** da consulta (aqui: "quem sou eu na
  AWS?").
- `"current"` e o nome interno; o resultado e lido com
  `data.aws_caller_identity.current.<atributo>`.

A consulta roda a cada `plan`/`apply`, entao o valor sempre reflete a conta e
o usuario de quem esta executando. E por isso que o codigo nao tem o numero
da conta AWS escrito em lugar nenhum: ele e descoberto na hora.

---

## 2. O que foi pedido e o que foi entregue

O enunciado da Fase 2 pede, em "Infraestrutura como Codigo (IaC)":

| Pedido | Entregue |
| --- | --- |
| Scripts Terraform para provisionar o cluster Kubernetes (local ou cloud) | Cluster **Amazon EKS** na AWS ([`infra/eks.tf`](../../infra/eks.tf)) |
| Banco de dados | **Amazon RDS PostgreSQL 16** ([`infra/rds.tf`](../../infra/rds.tf)) |
| Documentar quais recursos sao criados e como aplicar | Este guia e [infra/README.md](../../infra/README.md) |
| Scripts em `/infra` | Tudo em `infra/` |

Alem do minimo, a infraestrutura ja prepara o que as outras etapas precisam:

- **metrics-server** no cluster, sem o qual o HPA (autoscaling por CPU/memoria)
  dos manifestos em `/k8s` nao funciona.
- **Repositorios ECR** para as imagens Docker que a pipeline vai publicar.
- **Role OIDC para o GitHub Actions**, para a pipeline fazer deploy no cluster
  sem guardar chaves da AWS no GitHub.

Ficou de fora, de proposito: manifestos Kubernetes (`/k8s`), workflows de
CI/CD, autoscaling de nos (Cluster Autoscaler/Karpenter) e multiplos
ambientes (dev/prod).

---

## 3. Visao geral da arquitetura

```
                          Internet
                             |
                     [Internet Gateway]
                             |
   +-------------------------+---------------------------------+
   | VPC oficina-fiap-vpc  10.0.0.0/16                         |
   |                                                           |
   |   us-east-1a                        us-east-1b            |
   |   +-----------------------+         +-------------------+ |
   |   | Subnet publica        |         | Subnet publica    | |
   |   | 10.0.0.0/24           |         | 10.0.1.0/24       | |
   |   | [NAT Gateway]         |         | (Load Balancers)  | |
   |   +-----------------------+         +-------------------+ |
   |   +-----------------------+         +-------------------+ |
   |   | Subnet privada        |         | Subnet privada    | |
   |   | 10.0.10.0/24          |         | 10.0.11.0/24      | |
   |   | [No EKS t3.small]     |         | [No EKS t3.small] | |
   |   |  pods: API, Jobs      |         |  pods: API, Jobs  | |
   |   +-----------------------+         +-------------------+ |
   |   +-----------------------+         +-------------------+ |
   |   | Subnet de banco       |         | Subnet de banco   | |
   |   | 10.0.20.0/24          |         | 10.0.21.0/24      | |
   |   | [RDS PostgreSQL 16]   |         |                   | |
   |   +-----------------------+         +-------------------+ |
   +-----------------------------------------------------------+

   Fora da VPC (servicos regionais da AWS):
   - EKS control plane (gerenciado pela AWS)
   - ECR: oficina-api, oficina-migrator, oficina-seeder
   - IAM: role oficina-fiap-github-actions (OIDC do GitHub)
   - S3: oficina-fiap-tfstate-<conta> (state do Terraform)
```

Fluxo de uso:

1. A pipeline (GitHub Actions) assume a role via OIDC, publica as imagens no
   ECR e aplica os manifestos no EKS.
2. Os pods da API rodam nos nos, nas subnets privadas; saem para a internet
   (Stripe, SMTP) pelo NAT Gateway.
3. Os pods acessam o RDS pela porta 5432; o banco nao tem acesso pela
   internet.
4. Usuarios chegam na API por um Load Balancer criado pelo Kubernetes nas
   subnets publicas (configurado em `/k8s`).

---

## 4. Organizacao dos arquivos

```
infra/
  bootstrap/                 # cria o bucket S3 do state (roda 1 vez)
    main.tf                  #   bucket e suas protecoes
    variables.tf, versions.tf, outputs.tf
    tests/state_bucket.tftest.hcl
  versions.tf                # versao minima do Terraform e dos providers
  backend.tf                 # diz que o state fica no S3
  backend.hcl.example        # modelo do arquivo com o nome do bucket
  providers.tf               # provider AWS, regiao e tags padrao
  variables.tf               # todos os parametros ajustaveis
  data.tf                    # consulta quem esta executando (conta e usuario)
  network.tf                 # rede (VPC)
  eks.tf                     # cluster Kubernetes
  rds.tf                     # banco PostgreSQL
  ecr.tf                     # repositorios de imagens
  github-oidc.tf             # acesso do GitHub Actions
  outputs.tf                 # valores de saida
  terraform.tfvars.example   # modelo para trocar variaveis
  tests/*.tftest.hcl         # testes automatizados
  .tflint.hcl                # configuracao do linter
  .terraform.lock.hcl        # trava as versoes exatas dos providers
  .gitignore                 # impede commit de state, senhas e planos
  README.md                  # referencia rapida
```

Por que existem duas pastas (`bootstrap/` e a raiz)? O state precisa de um
bucket S3 **antes** de existir. A pasta `bootstrap/` cria esse bucket e guarda
o proprio state localmente (arquivo `infra/bootstrap/terraform.tfstate`, fora
do git). Depois, a raiz `infra/` usa o bucket para guardar o state de todo o
resto.

---

## 5. Recursos criados, um por um

Ao todo, o `apply` da raiz cria **86 recursos** e o bootstrap cria **5**. O numero varia com o tamanho do grupo `FIAP-POS`: cada admin alem de quem aplica soma 2 (access entry + permissao).
Primeiro vem a lista das consultas (`data`), que nao criam nada; depois cada
recurso criado, agrupado por arquivo. Recursos marcados com *(modulo)* sao
criados por dentro de um modulo da comunidade, configurado pelo nosso codigo.

### 5.0 Consultas (data sources) - nao criam nada

Antes de criar os recursos, o Terraform faz algumas consultas na AWS (blocos
`data`, explicados no item 1). Elas sao as "perguntas" cujas respostas
alimentam nomes, permissoes e acessos.

**No nosso codigo**

| Consulta | Arquivo | Pergunta que responde | Onde a resposta e usada |
| --- | --- | --- | --- |
| `data.aws_caller_identity.current` | `bootstrap/main.tf` | Qual o numero da conta AWS? | Nome do bucket do state: `oficina-fiap-tfstate-<conta>` (nome de bucket precisa ser unico no mundo; a conta garante isso). |
| `data.aws_caller_identity.current` | `data.tf` | Qual a conta e qual o ARN da sessao de quem esta executando? | Montar os ARNs dos 3 repositorios ECR e do cluster na politica da role do GitHub (`github-oidc.tf`). |
| `data.aws_iam_session_context.current` | `data.tf` | Qual o usuario ou role "de origem" de quem esta executando? | Quando a pessoa entra por uma role temporaria (ex.: SSO), o ARN da sessao e diferente do ARN da role; esta consulta devolve o ARN da role/usuario real (`issuer_arn`). Ele e somado aos membros do grupo `FIAP-POS` e a `cluster_admin_principal_arns` para que quem aplica sempre vire admin do cluster e da chave KMS (`eks.tf`). |
| `data.aws_iam_group.cluster_admins` | `eks.tf` | Quem sao os membros do grupo IAM `FIAP-POS`? | O EKS nao aceita grupo em access entry, so usuarios e roles. A consulta devolve os usuarios do grupo, e cada um ganha uma access entry de admin no cluster. Quem entrar no grupo ganha acesso no proximo `apply`. Com `cluster_admin_group_name = ""`, nao roda. |
| `data.aws_iam_openid_connect_provider.github` | `github-oidc.tf` | Qual o ARN do provedor OIDC do GitHub que ja existe na conta? | So e usada quando `create_github_oidc_provider = false` (conta que ja tem o provedor). Ai, em vez de criar outro (a AWS so permite um), o codigo reaproveita o existente na politica de confianca da role. Com o valor padrao `true`, essa consulta nao roda (`count = 0`). |

**Dentro dos modulos** (as principais; os modulos fazem outras consultas
internas semelhantes)

| Consulta | Modulo | Para que serve |
| --- | --- | --- |
| `aws_eks_addon_version` (5) | EKS | Descobre a versao mais recente de cada add-on compativel com o Kubernetes 1.37, para nao fixar versao a mao. |
| `aws_ssm_parameter` (AMI) | EKS (node group) | Busca na AWS a versao mais recente da imagem oficial AL2023 otimizada para EKS 1.37, para os nos nascerem com o sistema atualizado. |
| `tls_certificate` | EKS | Le o certificado do endereco OIDC do cluster para registrar o provedor IRSA. |
| `aws_iam_policy_document` | EKS, RDS, VPC | Monta em JSON as politicas IAM (quem pode assumir cada role, o que a chave KMS permite). Apesar do nome "data", nao consulta a AWS: so gera o texto da politica. |
| `aws_partition`, `aws_region`, `aws_caller_identity`, `aws_iam_session_context` | EKS, RDS, VPC | Mesma ideia das nossas: descobrir particao (`aws`), regiao, conta e quem aplica para montar ARNs e permissoes. |

Os testes tambem usam uma consulta: o modulo auxiliar
`infra/tests/helpers/caller/main.tf` repete `aws_caller_identity` +
`aws_iam_session_context` para descobrir o ARN de quem roda o teste e
verificar que essa pessoa aparece como admin do cluster.

### 5.1 State do Terraform - `infra/bootstrap/main.tf`

| Recurso | Nome na AWS | Para que serve |
| --- | --- | --- |
| `aws_s3_bucket` | `oficina-fiap-tfstate-<conta>` | Bucket que guarda o state. Tem `prevent_destroy`: o Terraform se recusa a apagar, para nao perder o controle da infraestrutura por engano. |
| `aws_s3_bucket_versioning` | - | Guarda versoes antigas do state. Se algo corromper o arquivo, da para voltar. |
| `aws_s3_bucket_server_side_encryption_configuration` | - | Criptografa os arquivos no disco (SSE-S3/AES256). O state contem a senha do banco. |
| `aws_s3_bucket_public_access_block` | - | Bloqueia qualquer acesso publico ao bucket. |
| `aws_s3_bucket_policy` | - | Nega qualquer acesso que nao use HTTPS (TLS). |

O lock (impede duas pessoas aplicarem ao mesmo tempo) usa o recurso nativo
do S3 (`use_lockfile = true`), sem tabela DynamoDB.

### 5.2 Rede - `infra/network.tf` (modulo VPC)

Explicacao detalhada da rede (enderecos, rotas, firewalls, caminhos do
trafego e o porque de cada escolha) em [rede-vpc.md](rede-vpc.md).

| Recurso | Quantidade | Para que serve |
| --- | --- | --- |
| `aws_vpc` *(modulo)* | 1 | A rede privada do projeto, `10.0.0.0/16` (65 mil enderecos). Tudo roda dentro dela. |
| `aws_subnet` publicas *(modulo)* | 2 | `10.0.0.0/24` e `10.0.1.0/24`, uma em cada AZ. Tem rota para a internet. Recebem o NAT e os Load Balancers. Tag `kubernetes.io/role/elb = 1` avisa o Kubernetes que pode criar Load Balancers publicos aqui. |
| `aws_subnet` privadas *(modulo)* | 2 | `10.0.10.0/24` e `10.0.11.0/24`. Onde rodam os nos do EKS. Nao sao acessiveis pela internet. Tag `kubernetes.io/role/internal-elb = 1` para Load Balancers internos. |
| `aws_subnet` de banco *(modulo)* | 2 | `10.0.20.0/24` e `10.0.21.0/24`. So para o RDS. Usam a mesma tabela de rotas das privadas: nada da internet chega nelas, e o RDS ainda e configurado sem acesso publico. |
| `aws_db_subnet_group` *(modulo)* | 1 | Agrupa as 2 subnets de banco; o RDS exige subnets em pelo menos 2 AZs. |
| `aws_internet_gateway` *(modulo)* | 1 | Porta de entrada/saida da VPC para a internet. |
| `aws_eip` *(modulo)* | 1 | IP publico fixo usado pelo NAT Gateway. |
| `aws_nat_gateway` *(modulo)* | 1 | Permite que os nos privados **saiam** para a internet (baixar imagens, chamar Stripe/SMTP) sem poderem ser **acessados** de fora. Um so, compartilhado, para reduzir custo (~US$ 33/mes cada). |
| `aws_route_table` e `aws_route` *(modulo)* | 2 + 2 | Tabelas de rotas: a publica aponta para o Internet Gateway; a privada (usada tambem pelas subnets de banco) aponta para o NAT. |
| `aws_route_table_association` *(modulo)* | 6 | Liga cada subnet a sua tabela de rotas. |
| `aws_default_security_group`, `aws_default_network_acl`, `aws_default_route_table` *(modulo)* | 1 cada | O modulo "adota" os itens padrao que toda VPC tem, deixando-os sem regras permissivas. |

**AZ (Availability Zone)** e um datacenter separado dentro da regiao. Usar
duas (`us-east-1a` e `us-east-1b`) faz com que a queda de um datacenter nao
derrube tudo.

### 5.3 Cluster Kubernetes - `infra/eks.tf` (modulo EKS)

**Control plane**

| Recurso | Nome / valor | Para que serve |
| --- | --- | --- |
| `aws_eks_cluster` *(modulo)* | `oficina-fiap-eks`, Kubernetes 1.37 | O "cerebro" do Kubernetes (API server, scheduler), gerenciado pela AWS. Endpoint publico (para `kubectl` local e runners do GitHub) e privado (para os nos). Autenticacao por access entries (modo `API`). |
| `aws_iam_role` do cluster *(modulo)* | - | Permissao para o EKS gerenciar recursos da AWS em nome do cluster. |
| `aws_iam_role_policy_attachment` do cluster *(modulo)* | varias | Anexa as politicas gerenciadas da AWS exigidas pelo EKS. |
| `aws_kms_key` e `aws_kms_alias` *(modulo)* | - | Chave de criptografia dos Secrets do Kubernetes (ex.: a `DATABASE_URL`). Administradores da chave = os mesmos admins do cluster. |
| `aws_iam_policy` de criptografia *(modulo)* | - | Permite ao cluster usar a chave KMS. |
| `aws_cloudwatch_log_group` *(modulo)* | `/aws/eks/oficina-fiap-eks/cluster` | Logs do control plane (`api`, `audit`, `authenticator`), retidos por 7 dias. |
| `aws_security_group` do cluster e dos nos + regras *(modulo)* | - | "Firewalls" que controlam quem fala com a API do cluster e entre os nos. |
| `aws_iam_openid_connect_provider` do cluster *(modulo)* | - | Provedor OIDC do proprio cluster (IRSA), que permite dar permissoes AWS especificas a pods no futuro. |
| `time_sleep` e `null_resource` *(modulo)* | - | Auxiliares internos do modulo: uma pausa curta entre criar o cluster e os nos, e uma validacao da faixa de IPs dos Services. Nao criam nada na AWS. |

**Nos (maquinas onde os pods rodam)**

| Recurso | Valor | Para que serve |
| --- | --- | --- |
| `aws_eks_node_group` *(modulo)* | `default`: 2 x `t3.small` (2 vCPU, 2 GB), min 2 / desejado 2 / max 2, sistema AL2023 | Grupo de maquinas EC2 gerenciado pelo EKS (a AWS cuida de atualizacao e substituicao). Ficam nas subnets privadas, uma em cada AZ. |
| `aws_launch_template` *(modulo)* | IMDSv2 obrigatorio | Modelo das maquinas. IMDSv2 protege as credenciais da maquina contra roubo por um pod. |
| `aws_iam_role` dos nos + 3 `aws_iam_role_policy_attachment` *(modulo)* | `AmazonEKSWorkerNodePolicy`, `AmazonEKS_CNI_Policy`, `AmazonEC2ContainerRegistryReadOnly` | Permite aos nos entrarem no cluster, configurarem a rede dos pods e baixarem imagens do ECR. |

Por que `t3.small` com no maximo 2? A conta AWS do grupo esta no **plano
Free**: ela so aceita tipos de instancia "free-tier eligible" e tem quota de
5 vCPUs. O primeiro apply com `t3.medium` falhou com `The specified instance
type is not eligible for Free Tier`. Em conta paga, basta trocar
`node_instance_types` e `node_max_size`.

**Add-ons (componentes instalados no cluster)**

| Recurso | Add-on | Para que serve |
| --- | --- | --- |
| `aws_eks_addon` *(modulo)* | `vpc-cni` | Da a cada pod um IP da VPC. Instalado antes dos nos. |
| `aws_eks_addon` *(modulo)* | `eks-pod-identity-agent` | Permite associar permissoes AWS a pods. Instalado antes dos nos. |
| `aws_eks_addon` *(modulo)* | `kube-proxy` | Roteamento dos Services do Kubernetes em cada no. |
| `aws_eks_addon` *(modulo)* | `coredns` | DNS interno (ex.: um pod achar outro pelo nome do Service). |
| `aws_eks_addon` *(modulo)* | `metrics-server` | Coleta uso de CPU/memoria dos pods. **Obrigatorio para o HPA** escalar a API. |

**Acesso ao cluster (quem pode usar `kubectl`)**

| Recurso | Para quem | Permissao |
| --- | --- | --- |
| `aws_eks_access_entry` + `aws_eks_access_policy_association` *(modulo)* | Quem executa o `apply` | `AmazonEKSClusterAdminPolicy` (admin) |
| idem | Cada membro do grupo IAM `FIAP-POS` (hoje `felipeassis`, `developersposito`, `beatrizbertan`, `kendyhonda` e `POS-FIAP-TF`) | admin |
| idem | Cada ARN extra em `cluster_admin_principal_arns` | admin |
| idem | Role `oficina-fiap-github-actions` | admin, para a pipeline aplicar os manifestos |

Cada admin tem uma entrada propria, identificada pelo seu ARN. Assim nao
importa qual colega roda o `apply`: as entradas sao sempre as mesmas.

### 5.4 Banco de dados - `infra/rds.tf`

| Recurso | Valor | Para que serve |
| --- | --- | --- |
| `random_password.db` | 32 caracteres, so letras e numeros | Senha do banco gerada pelo Terraform. Sem caracteres especiais para nao quebrar a URL de conexao. |
| `aws_security_group.rds` | `oficina-fiap-rds-*` | Firewall do banco. |
| `aws_vpc_security_group_ingress_rule.rds_from_nodes` | TCP 5432 | Unica regra de entrada: libera a porta do PostgreSQL **somente** para o security group dos nos do EKS. Nenhum IP externo. |
| `aws_db_instance` *(modulo)* | `oficina-fiap-postgres`, PostgreSQL 16, `db.t4g.micro`, 20 GB gp3 | O banco em si. Criptografado, sem acesso publico, em uma AZ, backup de 1 dia. Sem protecao contra exclusao e sem snapshot final, para o `destroy` funcionar facilmente (projeto academico). |
| `aws_db_parameter_group` *(modulo)* | familia `postgres16` | Configuracoes do PostgreSQL. Mantem o padrao `rds.force_ssl = 1`: conexoes sem TLS sao recusadas. |

Nome do banco: `oficina_fiap`. Usuario: `oficina_admin`.

A senha e passada ao RDS como argumento "write-only" (`password_wo`): ela nao
fica gravada no recurso do banco dentro do state, so no `random_password` e
no output `database_url`.

**URL de conexao** (output `database_url`, marcado como sensivel):

```
postgresql://oficina_admin:<senha>@<endpoint>:5432/oficina_fiap?sslmode=require&uselibpqcompat=true
```

- `sslmode=require`: obriga TLS, exigido pelo RDS.
- `uselibpqcompat=true`: o driver `pg` usado pela API (via
  `@prisma/adapter-pg`) trataria `require` como "validar o certificado", e o
  Node nao conhece a autoridade certificadora da Amazon RDS, o que daria
  `self-signed certificate in certificate chain`. Com esse parametro ele
  cifra a conexao sem validar a autoridade, como o `psql` faz.

Isso foi testado de verdade: o Job `migrator` (`prisma migrate deploy`)
aplicou todas as migrations e o driver `pg` conectou com `ssl=true`.

### 5.5 Repositorios de imagens - `infra/ecr.tf`

| Recurso | Nomes | Para que serve |
| --- | --- | --- |
| `aws_ecr_repository` (3) | `oficina-api`, `oficina-migrator`, `oficina-seeder` | Guardam as imagens Docker dos targets `runtime`, `migrator` e `seeder` do `Dockerfile`. Scan de vulnerabilidades a cada push. `force_delete` permite o `destroy` mesmo com imagens dentro. |
| `aws_ecr_lifecycle_policy` (3) | - | Mantem so as 10 imagens mais recentes em cada repositorio, apagando as antigas (economia de armazenamento). |

### 5.6 Acesso do GitHub Actions - `infra/github-oidc.tf`

O jeito antigo seria criar um usuario IAM e colar a access key nos Secrets do
GitHub (chave permanente, que pode vazar). Aqui usamos **OIDC**: a cada
execucao, o GitHub entrega um token temporario assinado, e a AWS troca esse
token por credenciais que valem por pouco tempo.

| Recurso | Nome | Para que serve |
| --- | --- | --- |
| `aws_iam_openid_connect_provider.github` | `token.actions.githubusercontent.com` | Faz a AWS confiar nos tokens emitidos pelo GitHub Actions. So pode existir um por conta; se ja existir, use `create_github_oidc_provider = false`. |
| `aws_iam_role.github_actions` | `oficina-fiap-github-actions` | A role que a pipeline assume. A politica de confianca so aceita tokens do repositorio `FIAP-Arquitetura-de-Software-17SOAT/oficina-fiap-api` executando na branch `main`. |
| `aws_iam_role_policy.github_actions` | `ecr-push-eks-describe` | O que a role pode fazer: login no ECR, push/pull **apenas** nos 3 repositorios do projeto e `eks:DescribeCluster` **apenas** no cluster do projeto (necessario para o `aws eks update-kubeconfig`). |

A permissao dentro do Kubernetes vem da access entry de admin (item 5.3).

---

## 6. Variaveis e outputs

### Variaveis (o que da para ajustar)

Para trocar algum valor, copie `infra/terraform.tfvars.example` para
`infra/terraform.tfvars` e edite.

| Variavel | Padrao | Significado |
| --- | --- | --- |
| `project_name` | `oficina-fiap` | Prefixo dos nomes e tag `Project` |
| `aws_region` | `us-east-1` | Regiao AWS |
| `availability_zones` | `us-east-1a`, `us-east-1b` | Exatamente 2 AZs (validado) |
| `kubernetes_version` | `1.37` | Versao do Kubernetes |
| `endpoint_public_access_cidrs` | `0.0.0.0/0` | Quem alcanca a API do cluster pela internet (login IAM continua obrigatorio) |
| `cluster_admin_group_name` | `FIAP-POS` | Grupo IAM cujos membros viram admins do cluster (`""` desativa) |
| `cluster_admin_principal_arns` | vazio | ARNs IAM extras, de fora do grupo, que tambem terao `kubectl` |
| `node_instance_types` | `t3.small` | Tipo de maquina dos nos |
| `node_min_size` / `node_desired_size` / `node_max_size` | 2 / 2 / 2 | Quantidade de nos (validado: min <= desejado <= max) |
| `db_instance_class` | `db.t4g.micro` | Tamanho do banco |
| `db_allocated_storage` | `20` | Disco do banco em GB |
| `github_repository` | `FIAP-Arquitetura-de-Software-17SOAT/oficina-fiap-api` | Repo autorizado na role OIDC (sem curingas, validado) |
| `github_branch` | `main` | Branch autorizada (sem curingas, validado) |
| `create_github_oidc_provider` | `true` | Criar ou reaproveitar o provedor OIDC do GitHub |

### Outputs (o que o Terraform entrega)

| Output | Exemplo / uso |
| --- | --- |
| `aws_region` | `us-east-1` |
| `cluster_name` | `oficina-fiap-eks` |
| `cluster_endpoint` | URL da API do Kubernetes |
| `configure_kubectl` | `aws eks update-kubeconfig --region us-east-1 --name oficina-fiap-eks` |
| `ecr_repository_urls` | URLs dos repositorios `api`, `migrator`, `seeder` |
| `github_actions_role_arn` | Vai no secret `AWS_ROLE_ARN` do GitHub |
| `rds_endpoint` | `host:5432` do banco |
| `database_url` | URL completa do banco (sensivel). Vai no Secret do Kubernetes |

---

## 7. Como o trabalho foi feito

1. **Levantamento.** O enunciado foi lido e as decisoes foram tomadas com o
   grupo, uma por vez: nuvem AWS em conta propria, EKS + RDS, state em S3,
   regiao `us-east-1`, rede com 1 NAT, perfil de custo enxuto, apply manual e
   pipeline so fazendo deploy.
2. **Escolha da abordagem.** Modulos da comunidade com versoes fixas, em vez
   de escrever cada recurso a mao: menos codigo, padroes seguros e
   amplamente usados.
3. **Verificacao antes de escrever.** As versoes disponiveis na conta foram
   consultadas na propria AWS (EKS 1.37, PostgreSQL 16, add-on
   `metrics-server`), e as entradas e saidas dos modulos foram conferidas no
   codigo-fonte deles.
4. **Testes primeiro (TDD).** Para cada arquivo, primeiro foi escrito um teste
   em `infra/tests/*.tftest.hcl` descrevendo o resultado esperado (ex.: "a
   role do GitHub so aceita a branch `main`"). O teste foi executado e falhou
   (o recurso ainda nao existia); depois o codigo foi escrito ate o teste
   passar. Os testes rodam apenas `plan`: leem a conta AWS, mas nao criam
   nada.
5. **Ordem de construcao**, um commit por etapa: bootstrap do state -> rede ->
   ECR -> EKS -> acesso do GitHub -> RDS -> documentacao.
6. **Qualidade.** Em cada etapa: `terraform fmt` (formatacao), `terraform
   validate` (sintaxe), `tflint` (boas praticas AWS) e a suite de testes.
7. **Teste real na AWS.** Bootstrap aplicado; `apply` da raiz; verificacao
   do cluster (`kubectl get nodes`, `kubectl top nodes`); imagens publicadas no
   ECR; Job `migrator` e verificacao de TLS rodando dentro do cluster;
   `destroy` completo e conferencia de que nao sobrou nada alem do bucket do
   state.
8. **Problema encontrado e resolvido.** O primeiro apply travou: os nos
   `t3.medium` nunca subiam. Investigando o CloudTrail, a causa foi a conta
   estar no plano Free da AWS. O grupo decidiu usar `t3.small` (max 2), o
   codigo foi corrigido com teste, e o segundo apply funcionou.
9. **Revisao final.** Um revisor independente avaliou o codigo inteiro. Um
   ponto importante foi corrigido (o acesso de admin dependia de quem rodava o
   apply); melhorias menores ficaram registradas para depois.

### Testes automatizados existentes

| Arquivo | O que garante |
| --- | --- |
| `bootstrap/tests/state_bucket.tftest.hcl` | Bucket com versionamento, criptografia, sem acesso publico e negando HTTP sem TLS |
| `tests/network.tftest.hcl` | CIDRs das subnets, tags de Load Balancer, exatamente 2 AZs |
| `tests/ecr.tftest.hcl` | 3 repositorios com scan, `force_delete` e limite de 10 imagens |
| `tests/eks.tftest.hcl` | Versao, add-ons (incluindo `metrics-server`), tamanho e IMDSv2 dos nos, admins estaveis independente de quem aplica, validacao de tamanhos |
| `tests/github_oidc.tftest.hcl` | Role so aceita a branch `main`, rejeita curingas, permissoes restritas aos 3 ECR e ao cluster, reuso de provedor OIDC existente |
| `tests/rds.tftest.hcl` | Nome do banco/usuario, senha alfanumerica, porta 5432 so a partir dos nos, formato exato da `database_url` |

Para rodar: veja o item 8, passo 0.

---

## 8. Passo a passo para aplicar

Os comandos abaixo sao para Bash (Linux, macOS ou **Git Bash** no Windows),
executados na raiz do repositorio.

### Passo 0 - Pre-requisitos

- Terraform 1.11.1 ou mais novo: `terraform version`
- AWS CLI v2 configurada com um usuario com permissao de administrador:
  `aws sts get-caller-identity` deve mostrar a conta
- kubectl: `kubectl version --client`

Opcional, rodar os testes (nao cria nada):

```bash
terraform -chdir=infra init -backend=false
terraform -chdir=infra test
```

### Passo 1 - Criar o bucket do state (uma vez por conta)

```bash
terraform -chdir=infra/bootstrap init
terraform -chdir=infra/bootstrap apply
```

O Terraform mostra que vai criar 5 recursos e pergunta `Enter a value:`.
Digite `yes`.

Depois gere o arquivo que aponta para o bucket:

```bash
terraform -chdir=infra/bootstrap output -raw backend_config > infra/backend.hcl
cat infra/backend.hcl
```

Deve aparecer `bucket = "oficina-fiap-tfstate-<conta>"` e
`region = "us-east-1"`.

> Guarde o arquivo `infra/bootstrap/terraform.tfstate` (ele nao vai para o
> git). Ele so e necessario se um dia for alterar o bucket.

### Passo 2 - (Opcional) Ajustar variaveis

```bash
cp infra/terraform.tfvars.example infra/terraform.tfvars
```

Os membros do grupo IAM `FIAP-POS` ja viram admins do cluster sem configurar
nada. Para dar acesso a alguem de fora do grupo, edite:

```hcl
cluster_admin_principal_arns = [
  "arn:aws:iam::123456789012:user/colega",
]
```

### Passo 3 - Inicializar com o state remoto

```bash
terraform -chdir=infra init -backend-config=backend.hcl
```

Deve aparecer `Successfully configured the backend "s3"!`.

### Passo 4 - Ver o plano

```bash
terraform -chdir=infra plan -out=tfplan
```

Leia o resumo no final: `Plan: 86 to add, 0 to change, 0 to destroy.` (com os 5 membros atuais do grupo `FIAP-POS`).
Nada foi criado ainda.

### Passo 5 - Aplicar

```bash
terraform -chdir=infra apply tfplan
```

Leva de 15 a 20 minutos (o cluster EKS sozinho leva ~10). No final aparece
`Apply complete!` e a lista de outputs.

> A partir daqui a conta gera custo: cerca de **US$ 0,21 por hora**.

### Passo 6 - Conectar o kubectl ao cluster

```bash
$(terraform -chdir=infra output -raw configure_kubectl)
kubectl get nodes
kubectl top nodes
```

Devem aparecer 2 nos com `STATUS Ready`. O `kubectl top nodes` mostra CPU e
memoria quando o `metrics-server` termina de subir (cerca de 1 minuto).

### Passo 7 - Entregar os dados para o Kubernetes e a pipeline

```bash
terraform -chdir=infra output -raw database_url        # vai no Secret do K8s
terraform -chdir=infra output -raw github_actions_role_arn   # secret AWS_ROLE_ARN no GitHub
terraform -chdir=infra output ecr_repository_urls       # para docker push e manifestos
```

Exemplo de criacao do Secret do banco no cluster (ajuste o namespace):

```bash
kubectl create secret generic oficina-db \
  --from-literal=DATABASE_URL="$(terraform -chdir=infra output -raw database_url)"
```

A senha muda a cada `destroy` + `apply`; recrie o Secret depois de recriar o
ambiente.

---

## 9. Passo a passo para destruir

1. Apague do cluster os recursos de `/k8s`, principalmente Services do tipo
   `LoadBalancer`. Esses Load Balancers sao criados pelo Kubernetes, nao pelo
   Terraform, e impedem a exclusao da VPC:

   ```bash
   kubectl delete -f k8s/ --ignore-not-found
   kubectl get svc -A | grep LoadBalancer    # deve voltar vazio
   ```

2. Destrua a infraestrutura (cerca de 15 minutos):

   ```bash
   terraform -chdir=infra destroy
   ```

   Confira a lista e digite `yes`. No final: `Destroy complete! Resources: 86 destroyed.`

O bucket do state **continua** existindo (protegido por `prevent_destroy`),
para o proximo `apply`. A chave KMS fica agendada para exclusao pela AWS
(30 dias, sem custo relevante).

---

## 10. Problemas comuns

| Sintoma | Causa | Solucao |
| --- | --- | --- |
| Apply parado em `aws_eks_node_group ... Still creating` por mais de 10 minutos | Instancia nao permitida pela conta (plano Free) ou quota de vCPU | Ver eventos `RunInstances` no CloudTrail; usar tipo free-tier (`t3.small`) ou fazer upgrade do plano e pedir aumento de quota |
| `Error acquiring the state lock` | Outra pessoa (ou execucao interrompida) esta com o lock | Esperar a outra execucao; se ela morreu, `terraform -chdir=infra force-unlock <ID>` |
| `EntityAlreadyExists` no provedor OIDC do GitHub | A conta ja tem esse provedor | `create_github_oidc_provider = false` no `terraform.tfvars` |
| `destroy` travado apagando subnets/VPC | Load Balancer criado pelo Kubernetes ainda existe | Apagar os Services `LoadBalancer` (item 9, passo 1) ou o Load Balancer no console EC2 |
| `kubectl`: `You must be logged in to the server (Unauthorized)` | Seu ARN nao tem access entry | Entrar no grupo IAM `FIAP-POS` (ou ter o ARN em `cluster_admin_principal_arns`) e reaplicar |
| API ou migrator com `self-signed certificate in certificate chain` | `DATABASE_URL` sem `uselibpqcompat=true` | Usar a URL exatamente como sai do output `database_url` |
| GitHub Actions: `Not authorized to perform sts:AssumeRoleWithWebIdentity` | Workflow rodando fora da `main` ou usando `environment:` | Rodar o deploy na `main`, sem `environment:` (ou ajustar `github-oidc.tf`) |

---

## 11. Glossario

Nome completo e explicacao de cada sigla (ARN, AZ, VPC, NAT, SMTP etc.) em
[acronimos-infraestrutura.md](acronimos-infraestrutura.md).

| Termo | Significado |
| --- | --- |
| **AWS** | Amazon Web Services, a nuvem usada |
| **Regiao** | Localizacao geografica dos datacenters (`us-east-1` = Virginia, EUA) |
| **AZ** | Availability Zone: datacenter isolado dentro da regiao |
| **VPC** | Rede privada virtual na AWS |
| **Subnet** | Faixa de enderecos dentro da VPC, presa a uma AZ |
| **CIDR** | Notacao de faixa de IPs, ex.: `10.0.0.0/24` = 256 enderecos |
| **NAT Gateway** | Permite saida para a internet sem permitir entrada |
| **Security Group** | Firewall de recursos (quem pode falar com quem, em qual porta) |
| **EKS** | Kubernetes gerenciado pela AWS |
| **Node group** | Conjunto de maquinas EC2 que rodam os pods |
| **Add-on** | Componente do cluster instalado e atualizado pela AWS |
| **Access entry** | Registro que da a um usuario/role IAM acesso ao Kubernetes |
| **HPA** | Horizontal Pod Autoscaler: aumenta/diminui pods conforme CPU/memoria |
| **RDS** | Banco de dados relacional gerenciado pela AWS |
| **ECR** | Registro de imagens Docker da AWS |
| **IAM** | Servico de usuarios, roles e permissoes da AWS |
| **Role** | Identidade IAM assumida temporariamente (por servico, pipeline ou pessoa) |
| **OIDC** | Padrao de autenticacao por token; permite ao GitHub provar sua identidade para a AWS |
| **ARN** | Identificador unico de um recurso AWS, ex.: `arn:aws:iam::123456789012:user/nome` |
| **KMS** | Servico de chaves de criptografia da AWS |
| **IMDSv2** | Versao protegida do servico de metadados das maquinas EC2 |
| **TLS** | Criptografia da conexao (o "S" de HTTPS) |
| **State** | Registro do Terraform com tudo o que ele criou |
| **Backend** | Onde o state fica guardado (aqui, S3) |
| **Modulo** | Pacote reutilizavel de codigo Terraform |
| **Data source** | Bloco `data`: consulta algo que ja existe (conta, usuario, versao, imagem) sem criar nada |
| **Provider** | Plugin do Terraform para um servico (AWS, random) |
