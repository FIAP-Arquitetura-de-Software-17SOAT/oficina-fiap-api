# Infraestrutura (Terraform)

Provisiona na AWS (`us-east-1`) o ambiente da Oficina FIAP API: rede, cluster
Kubernetes (EKS), banco PostgreSQL (RDS), registro de imagens (ECR) e o acesso
do GitHub Actions. Manifestos Kubernetes ficam em `/k8s` e a pipeline em
`.github/workflows`; este diretorio entrega os outputs que eles consomem.

## Arquitetura

```
                    Internet
                       |
        +--------------+---------------------------+
        | VPC 10.0.0.0/16 (us-east-1a, us-east-1b) |
        |                                          |
        |  Subnets publicas  10.0.0.0/24, .1.0/24  |
        |   - NAT Gateway (1)                      |
        |   - Load Balancers dos Services K8s      |
        |                                          |
        |  Subnets privadas  10.0.10.0/24, .11.0/24|
        |   - Nos EKS (t3.small, 2)                |
        |     Pods: API, Jobs migrator/seeder      |
        |                                          |
        |  Subnets de banco  10.0.20.0/24, .21.0/24|
        |   - RDS PostgreSQL 16 (5432 so dos nos)  |
        +------------------------------------------+

  ECR (oficina-api, oficina-migrator, oficina-seeder)
  IAM OIDC -> role oficina-fiap-github-actions (push ECR + deploy EKS)
  S3 oficina-fiap-tfstate-<account_id> (state do Terraform)
```

## Recursos criados

| Arquivo | Recursos |
| --- | --- |
| `bootstrap/main.tf` | Bucket S3 `oficina-fiap-tfstate-<account_id>` para o state: versionamento, criptografia SSE-S3, bloqueio de acesso publico, policy que nega acesso sem TLS e `prevent_destroy` |
| `network.tf` | VPC `oficina-fiap-vpc` (`10.0.0.0/16`) em 2 AZs; 2 subnets publicas (tag `kubernetes.io/role/elb`), 2 privadas (tag `kubernetes.io/role/internal-elb`), 2 de banco com subnet group; Internet Gateway; 1 NAT Gateway com Elastic IP; route tables |
| `eks.tf` | Cluster EKS `oficina-fiap-eks` (Kubernetes 1.37) com endpoint publico e privado, autenticacao por access entries, criptografia de secrets com KMS, logs do control plane (retencao de 7 dias); managed node group `default` (AL2023, `t3.small`, ON_DEMAND, min 2 / desejado 2 / max 2, IMDSv2) em subnets privadas; add-ons `vpc-cni`, `kube-proxy`, `coredns`, `eks-pod-identity-agent` e `metrics-server` (necessario para o HPA); roles IAM do cluster e dos nos; security groups; access entries de admin para cada membro do grupo IAM `FIAP-POS` (`cluster_admin_group_name`), para `cluster_admin_principal_arns`, para quem aplica e para a role do GitHub Actions |
| `rds.tf` | RDS PostgreSQL 16 `oficina-fiap-postgres` (`db.t4g.micro`, 20 GB gp3 criptografado, single-AZ, sem acesso publico, backup de 1 dia, sem deletion protection); parameter group `postgres16` (TLS obrigatorio); security group que libera 5432 somente para o security group dos nos EKS; senha aleatoria de 32 caracteres (`random_password`) |
| `ecr.tf` | Repositorios ECR `oficina-api`, `oficina-migrator`, `oficina-seeder` com scan on push e lifecycle que mantem as 10 imagens mais recentes |
| `github-oidc.tf` | OIDC provider `token.actions.githubusercontent.com` e role `oficina-fiap-github-actions`, assumivel somente por workflows da branch `main` do repositorio `FIAP-Arquitetura-de-Software-17SOAT/oficina-fiap-api`; permite login/push/pull nos 3 repositorios ECR e `eks:DescribeCluster` |

## Custo estimado

Com tudo ligado, cerca de **US$ 0,21 por hora** (~US$ 150/mes): control plane
EKS US$ 0,10/h, 2 x `t3.small` ~US$ 0,042/h, NAT Gateway ~US$ 0,045/h + dados,
RDS `db.t4g.micro` ~US$ 0,016/h, volumes EBS e KMS. Destrua o ambiente quando
nao estiver usando.

## Pre-requisitos

- Terraform >= 1.11.1
- AWS CLI v2 com credenciais de uma identidade com permissao administrativa
  na conta (`aws sts get-caller-identity` deve responder)
- kubectl
- Docker (para publicar imagens manualmente)

Contas AWS no plano Free so lancam instancias free-tier eligible e tem quota
padrao de 5 vCPU On-Demand. Por isso o node group usa `t3.small` com no
maximo 2 nos. Em conta no plano Paid, ajuste `node_instance_types` e
`node_max_size` (e a quota de vCPU, se necessario) em `terraform.tfvars`.

Capacidade: os manifestos de `/k8s` reservam 384Mi por Pod da API (HPA de 2 a
4 Pods, mais 1 extra durante a atualizacao). Nos 2 nos `t3.small` (2 GiB cada)
isso cabe, mas apertado. Se algum Pod ficar `Pending` com `Insufficient memory`,
use `node_instance_types = ["c7i-flex.large"]` (2 vCPU / 4 GiB, aceito no plano
Free; 2 nos usam 4 das 5 vCPU). Custo dos nos sobe de ~US$ 0,04/h para
~US$ 0,17/h.

## Como aplicar

Todos os comandos a partir da raiz do repositorio.

1. Criar o bucket do state (uma vez por conta):

   ```bash
   terraform -chdir=infra/bootstrap init
   terraform -chdir=infra/bootstrap apply
   terraform -chdir=infra/bootstrap output -raw backend_config > infra/backend.hcl
   ```

   O state do bootstrap fica local em `infra/bootstrap/terraform.tfstate`
   (gitignored). Guarde-o: ele so e necessario para alterar o bucket.

2. (Opcional) Ajustar variaveis:

   ```bash
   cp infra/terraform.tfvars.example infra/terraform.tfvars
   ```

   Acesso ao cluster (`kubectl`): todo membro do grupo IAM `FIAP-POS`
   (`cluster_admin_group_name`) vira admin. O EKS nao aceita grupo em access
   entry, entao o Terraform le os membros do grupo e cria uma entrada para
   cada um; quem entrar no grupo ganha acesso no proximo `apply`. Quem aplica
   sempre vira admin. Para alguem de fora do grupo, informe o ARN em
   `cluster_admin_principal_arns`. Se a conta ja tiver o OIDC provider do
   GitHub, use `create_github_oidc_provider = false`.

3. Inicializar com o backend remoto e aplicar (cerca de 15 a 20 minutos):

   ```bash
   terraform -chdir=infra init -backend-config=backend.hcl
   terraform -chdir=infra plan -out=tfplan
   terraform -chdir=infra apply tfplan
   ```

4. Configurar o kubectl e conferir o cluster:

   ```bash
   $(terraform -chdir=infra output -raw configure_kubectl)
   kubectl get nodes
   kubectl top nodes
   ```

   `kubectl top nodes` responde quando o `metrics-server` esta pronto
   (cerca de 1 minuto apos o apply).

## Outputs

| Output | Uso |
| --- | --- |
| `aws_region` | Regiao para AWS CLI e pipeline |
| `cluster_name` | Nome do cluster para `aws eks update-kubeconfig` |
| `cluster_endpoint` | Endpoint da API do Kubernetes |
| `configure_kubectl` | Comando pronto para configurar o kubectl |
| `ecr_repository_urls` | URLs dos repositorios (`api`, `migrator`, `seeder`) para `docker push` e para os manifestos |
| `github_actions_role_arn` | Role que a pipeline assume via OIDC |
| `rds_endpoint` | Host e porta do PostgreSQL |
| `database_url` | `DATABASE_URL` completa (sensivel) para o Secret do Kubernetes |

Ler o `database_url`:

```bash
terraform -chdir=infra output -raw database_url
```

A URL termina em `?sslmode=require&uselibpqcompat=true`: o RDS exige TLS e o
parametro `uselibpqcompat` faz o driver `pg` cifrar a conexao sem validar a CA
da Amazon RDS. Use a URL sem alteracoes no Secret da API e dos Jobs
`migrator` e `seeder`.

O RDS so aceita conexoes vindas dos nos do EKS. Para acessar o banco a partir
da maquina local, use um Pod temporario no cluster, por exemplo:

```bash
kubectl run psql --rm -it --image=postgres:16 --restart=Never -- \
  psql "$(terraform -chdir=infra output -raw database_url | sed 's/&uselibpqcompat=true//')"
```

## Integracao com o CI/CD

1. Cadastre no GitHub (Settings > Secrets and variables > Actions):
   - `AWS_ROLE_ARN` = `terraform -chdir=infra output -raw github_actions_role_arn`
   - `AWS_REGION` = `us-east-1`
   - `EKS_CLUSTER_NAME` = `terraform -chdir=infra output -raw cluster_name`
   - `ECR_REGISTRY` = `<account_id>.dkr.ecr.us-east-1.amazonaws.com`
2. No workflow, conceda `permissions: id-token: write` e use
   `aws-actions/configure-aws-credentials` com `role-to-assume: ${{ secrets.AWS_ROLE_ARN }}`.
3. A role so pode ser assumida por execucoes na branch `main`. Jobs que
   declaram `environment:` recebem outro subject no token OIDC e serao
   recusados; para usar environments, ajuste `github-oidc.tf`.
4. O Secret `DATABASE_URL` do Kubernetes e criado a partir do output
   `database_url`; a role do CI nao le o state do Terraform.

## Como destruir

1. Remova do cluster os Services do tipo `LoadBalancer` (ou todos os
   manifestos de `/k8s`). Load Balancers criados pelo Kubernetes nao sao
   gerenciados pelo Terraform e impedem a exclusao da VPC:

   ```bash
   kubectl delete -f k8s/ --ignore-not-found
   kubectl get svc -A | grep LoadBalancer   # deve voltar vazio
   ```

2. Destrua a infraestrutura (cerca de 15 minutos):

   ```bash
   terraform -chdir=infra destroy
   ```

O bucket do state continua existindo (`prevent_destroy`). A chave KMS do
cluster fica agendada para exclusao pela AWS (janela padrao de 30 dias).

## Testes

```bash
terraform fmt -check -recursive infra
terraform -chdir=infra/bootstrap init -backend=false && terraform -chdir=infra/bootstrap test
terraform -chdir=infra init -backend=false && terraform -chdir=infra test
tflint --chdir=infra --init && tflint --chdir=infra
```

Os testes (`tests/*.tftest.hcl`) executam somente `plan`: precisam de
credenciais AWS para ler dados da conta, mas nao criam recursos.
