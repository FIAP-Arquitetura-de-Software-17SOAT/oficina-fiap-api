# Configuracao parcial: bucket e region vem de backend.hcl
# (terraform init -backend-config=backend.hcl), porque o bloco backend
# nao aceita variaveis. O bucket e criado por infra/bootstrap.
terraform {
  backend "s3" {
    key          = "oficina-fiap/terraform.tfstate"
    encrypt      = true
    use_lockfile = true
  }
}
