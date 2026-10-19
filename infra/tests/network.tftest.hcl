run "network_layout" {
  command = plan

  assert {
    condition     = module.vpc.name == "oficina-fiap-vpc"
    error_message = "VPC deve se chamar oficina-fiap-vpc."
  }

  assert {
    condition     = module.vpc.public_subnets_cidr_blocks == tolist(["10.0.0.0/24", "10.0.1.0/24"])
    error_message = "Subnets publicas devem ser 10.0.0.0/24 e 10.0.1.0/24."
  }

  assert {
    condition     = module.vpc.private_subnets_cidr_blocks == tolist(["10.0.10.0/24", "10.0.11.0/24"])
    error_message = "Subnets privadas devem ser 10.0.10.0/24 e 10.0.11.0/24."
  }

  assert {
    condition     = module.vpc.database_subnets_cidr_blocks == tolist(["10.0.20.0/24", "10.0.21.0/24"])
    error_message = "Subnets de banco devem ser 10.0.20.0/24 e 10.0.21.0/24."
  }

  assert {
    condition     = local.subnet_tags.public["kubernetes.io/role/elb"] == "1" && local.subnet_tags.private["kubernetes.io/role/internal-elb"] == "1"
    error_message = "Subnets precisam das tags de descoberta de Load Balancer do Kubernetes."
  }

  assert {
    condition     = output.aws_region == "us-east-1"
    error_message = "Regiao padrao deve ser us-east-1."
  }
}

run "rejects_availability_zone_count_other_than_two" {
  command = plan

  variables {
    availability_zones = ["us-east-1a"]
  }

  expect_failures = [var.availability_zones]
}
