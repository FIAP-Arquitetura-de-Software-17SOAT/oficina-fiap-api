locals {
  # Tags usadas pelo Kubernetes para descobrir onde criar Load Balancers
  # de Services do tipo LoadBalancer (publico e interno).
  subnet_tags = {
    public  = { "kubernetes.io/role/elb" = "1" }
    private = { "kubernetes.io/role/internal-elb" = "1" }
  }
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "6.7.3"

  name = "${var.project_name}-vpc"
  cidr = "10.0.0.0/16"
  azs  = var.availability_zones

  public_subnets   = ["10.0.0.0/24", "10.0.1.0/24"]
  private_subnets  = ["10.0.10.0/24", "10.0.11.0/24"]
  database_subnets = ["10.0.20.0/24", "10.0.21.0/24"]

  create_database_subnet_group = true

  # Um NAT compartilhado: reduz custo fixo; egress das subnets privadas
  # depende da AZ do NAT.
  enable_nat_gateway = true
  single_nat_gateway = true

  enable_dns_hostnames = true
  enable_dns_support   = true

  public_subnet_tags  = local.subnet_tags.public
  private_subnet_tags = local.subnet_tags.private
}
