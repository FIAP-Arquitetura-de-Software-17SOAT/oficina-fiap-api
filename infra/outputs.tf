output "aws_region" {
  description = "Regiao AWS da infraestrutura."
  value       = var.aws_region
}

output "ecr_repository_urls" {
  description = "URLs dos repositorios ECR das imagens runtime, migrator e seeder."
  value       = { for key, repo in aws_ecr_repository.this : key => repo.repository_url }
}
