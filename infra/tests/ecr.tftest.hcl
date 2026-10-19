run "ecr_repositories" {
  command = plan

  assert {
    condition     = toset(keys(aws_ecr_repository.this)) == toset(["api", "migrator", "seeder"])
    error_message = "Devem existir repositorios para api, migrator e seeder."
  }

  assert {
    condition = (
      aws_ecr_repository.this["api"].name == "oficina-api" &&
      aws_ecr_repository.this["migrator"].name == "oficina-migrator" &&
      aws_ecr_repository.this["seeder"].name == "oficina-seeder"
    )
    error_message = "Nomes dos repositorios devem ser oficina-api, oficina-migrator e oficina-seeder."
  }

  assert {
    condition     = alltrue([for repo in aws_ecr_repository.this : repo.image_scanning_configuration[0].scan_on_push])
    error_message = "Scan on push deve estar habilitado em todos os repositorios."
  }

  assert {
    condition     = alltrue([for repo in aws_ecr_repository.this : repo.force_delete])
    error_message = "force_delete deve estar habilitado para o destroy nao travar com imagens."
  }

  assert {
    condition     = alltrue([for policy in aws_ecr_lifecycle_policy.this : jsondecode(policy.policy).rules[0].selection.countNumber == 10])
    error_message = "Lifecycle policy deve manter as 10 imagens mais recentes."
  }

  assert {
    condition     = toset(keys(output.ecr_repository_urls)) == toset(["api", "migrator", "seeder"])
    error_message = "Output ecr_repository_urls deve ter as chaves api, migrator e seeder."
  }
}
