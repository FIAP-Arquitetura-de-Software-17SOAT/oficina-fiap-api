variable "project_name" {
  description = "Prefixo usado nos nomes dos recursos e na tag Project."
  type        = string
  default     = "oficina-fiap"
}

variable "aws_region" {
  description = "Regiao AWS onde a infraestrutura e criada."
  type        = string
  default     = "us-east-1"
}

variable "availability_zones" {
  description = "Duas AZs usadas pelas subnets publicas, privadas e de banco."
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]

  validation {
    condition     = length(var.availability_zones) == 2
    error_message = "Informe exatamente 2 availability zones; o layout de subnets tem 2 subnets por camada."
  }
}

variable "kubernetes_version" {
  description = "Versao do Kubernetes do EKS."
  type        = string
  default     = "1.37"
}

variable "endpoint_public_access_cidrs" {
  description = "CIDRs que alcancam o endpoint publico da API do EKS (autenticacao IAM continua obrigatoria)."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "cluster_admin_principal_arns" {
  description = "ARNs IAM (usuarios/roles) dos colegas que recebem acesso de admin ao cluster. Quem executa o apply ja e admin."
  type        = list(string)
  default     = []
}

variable "cluster_admin_group_name" {
  description = "Grupo IAM cujos membros recebem admin no cluster. O EKS nao aceita grupo em access entry; o Terraform le os membros e cria uma entrada para cada um. Vazio desativa."
  type        = string
  default     = "FIAP-POS"
}

variable "node_instance_types" {
  description = "Tipos de instancia do node group. Contas no plano Free da AWS so aceitam tipos free-tier eligible."
  type        = list(string)
  default     = ["t3.small"]
}

variable "node_min_size" {
  description = "Minimo de nos do node group."
  type        = number
  default     = 2
}

variable "node_max_size" {
  description = "Maximo de nos do node group. A quota padrao de 5 vCPU On-Demand comporta 2 nos de 2 vCPU."
  type        = number
  default     = 2
}

variable "node_desired_size" {
  description = "Quantidade desejada de nos do node group."
  type        = number
  default     = 2

  validation {
    condition     = var.node_min_size <= var.node_desired_size && var.node_desired_size <= var.node_max_size
    error_message = "Use node_min_size <= node_desired_size <= node_max_size."
  }
}

variable "github_repository" {
  description = "Repositorio GitHub (owner/nome) autorizado a assumir a role de CI/CD."
  type        = string
  default     = "FIAP-Arquitetura-de-Software-17SOAT/oficina-fiap-api"

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "Use o formato owner/repositorio, sem curingas."
  }
}

variable "github_oidc_immutable_prefix" {
  description = <<-EOT
    Prefixo do claim "sub" quando o repositorio usa subject imutavel (com IDs),
    no formato repo:<owner>@<owner_id>/<repo>@<repo_id>. Descubra com:
    gh api repos/<owner>/<repo>/actions/oidc/customization/sub
    Vazio mantem so o formato por nome (repo:<owner>/<repo>).
  EOT
  type        = string
  default     = "repo:FIAP-Arquitetura-de-Software-17SOAT@298907907/oficina-fiap-api@1325988245"

  validation {
    condition     = var.github_oidc_immutable_prefix == "" || can(regex("^repo:[^*?]+$", var.github_oidc_immutable_prefix))
    error_message = "Use o prefixo exato retornado pela API do GitHub, sem curingas."
  }
}

variable "github_branch" {
  description = "Branch cujo workflow pode assumir a role de CI/CD."
  type        = string
  default     = "main"

  validation {
    condition     = can(regex("^[A-Za-z0-9_./-]+$", var.github_branch))
    error_message = "Informe um nome de branch exato, sem curingas."
  }
}

variable "create_github_oidc_provider" {
  description = "Cria o OIDC provider do GitHub. Use false se a conta ja tiver um (so existe um por conta)."
  type        = bool
  default     = true
}

variable "db_instance_class" {
  description = "Classe da instancia RDS."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "Armazenamento do RDS em GB."
  type        = number
  default     = 20
}
