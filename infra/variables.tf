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
