# Modulo auxiliar dos testes: descobre o ARN de quem executa o Terraform
# para testar que ele e removido de cluster_admin_principal_arns.
terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

data "aws_caller_identity" "current" {}

data "aws_iam_session_context" "current" {
  arn = data.aws_caller_identity.current.arn
}

output "issuer_arn" {
  value = data.aws_iam_session_context.current.issuer_arn
}
