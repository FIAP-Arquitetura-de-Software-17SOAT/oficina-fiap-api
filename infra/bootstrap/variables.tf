variable "project_name" {
  description = "Prefixo usado nos nomes e na tag Project."
  type        = string
  default     = "oficina-fiap"
}

variable "aws_region" {
  description = "Regiao AWS do bucket do state."
  type        = string
  default     = "us-east-1"
}
