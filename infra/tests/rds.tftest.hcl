run "database_configuration" {
  command = plan

  assert {
    condition     = local.db_name == "oficina_fiap" && local.db_username == "oficina_admin"
    error_message = "Banco deve ser oficina_fiap com usuario oficina_admin."
  }

  assert {
    condition     = random_password.db.length == 32 && random_password.db.special == false
    error_message = "Senha deve ter 32 caracteres alfanumericos (sem escapar na URL)."
  }

  assert {
    condition = (
      aws_vpc_security_group_ingress_rule.rds_from_nodes.ip_protocol == "tcp" &&
      aws_vpc_security_group_ingress_rule.rds_from_nodes.from_port == 5432 &&
      aws_vpc_security_group_ingress_rule.rds_from_nodes.to_port == 5432 &&
      aws_vpc_security_group_ingress_rule.rds_from_nodes.cidr_ipv4 == null
    )
    error_message = "RDS so aceita 5432/tcp vindo do security group dos nos, nunca de um CIDR."
  }

  assert {
    condition     = var.db_instance_class == "db.t4g.micro" && var.db_allocated_storage == 20
    error_message = "Padrao do banco deve ser db.t4g.micro com 20 GB."
  }
}

run "database_url_format" {
  command = plan

  override_resource {
    target          = random_password.db
    override_during = plan
    values = {
      result = "s3cr3tPassw0rd"
    }
  }

  override_module {
    target          = module.rds
    override_during = plan
    outputs = {
      db_instance_address  = "oficina-fiap-postgres.abc123.us-east-1.rds.amazonaws.com"
      db_instance_endpoint = "oficina-fiap-postgres.abc123.us-east-1.rds.amazonaws.com:5432"
    }
  }

  assert {
    condition     = output.database_url == "postgresql://oficina_admin:s3cr3tPassw0rd@oficina-fiap-postgres.abc123.us-east-1.rds.amazonaws.com:5432/oficina_fiap?sslmode=require&uselibpqcompat=true"
    error_message = "database_url deve seguir o formato com sslmode=require&uselibpqcompat=true."
  }

  assert {
    condition     = output.rds_endpoint == "oficina-fiap-postgres.abc123.us-east-1.rds.amazonaws.com:5432"
    error_message = "rds_endpoint deve expor host:porta do RDS."
  }
}
