output "aws_region" {
  description = "Regiao AWS da infraestrutura."
  value       = var.aws_region
}

output "ecr_repository_urls" {
  description = "URLs dos repositorios ECR das imagens runtime, migrator e seeder."
  value       = { for key, repo in aws_ecr_repository.this : key => repo.repository_url }
}

output "cluster_name" {
  description = "Nome do cluster EKS."
  value       = module.eks.cluster_name
}

output "cluster_endpoint" {
  description = "Endpoint da API do Kubernetes."
  value       = module.eks.cluster_endpoint
}

output "configure_kubectl" {
  description = "Comando para configurar o kubectl local."
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${module.eks.cluster_name}"
}

output "github_actions_role_arn" {
  description = "ARN da role que o GitHub Actions assume via OIDC (secret AWS_ROLE_ARN)."
  value       = aws_iam_role.github_actions.arn
}

output "rds_endpoint" {
  description = "Endpoint (host:porta) do RDS PostgreSQL."
  value       = module.rds.db_instance_endpoint
}

output "database_url" {
  description = "DATABASE_URL para o Secret do Kubernetes (terraform output -raw database_url)."
  value       = local.database_url
  sensitive   = true
}
