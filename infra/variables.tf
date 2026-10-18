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

variable "node_instance_types" {
  description = "Tipos de instancia do node group."
  type        = list(string)
  default     = ["t3.medium"]
}

variable "node_min_size" {
  description = "Minimo de nos do node group."
  type        = number
  default     = 2
}

variable "node_max_size" {
  description = "Maximo de nos do node group."
  type        = number
  default     = 4
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
