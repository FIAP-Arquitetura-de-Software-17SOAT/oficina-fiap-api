locals {
  db_name     = "oficina_fiap"
  db_username = "oficina_admin"

  # rds.force_ssl = 1 (padrao do Postgres 16 no RDS) exige TLS.
  # uselibpqcompat=true faz o driver pg tratar sslmode=require como o libpq
  # (cifra sem validar a CA da RDS); sem ele, o pg trata require como
  # verify-full e falha com "self-signed certificate in certificate chain".
  database_url = "postgresql://${local.db_username}:${random_password.db.result}@${module.rds.db_instance_address}:5432/${local.db_name}?sslmode=require&uselibpqcompat=true"
}

# Apenas letras e numeros: a senha vai crua dentro da DATABASE_URL.
resource "random_password" "db" {
  length  = 32
  special = false
}

resource "aws_security_group" "rds" {
  name_prefix = "${var.project_name}-rds-"
  description = "PostgreSQL acessivel somente pelos nos do EKS"
  vpc_id      = module.vpc.vpc_id

  tags = {
    Name = "${var.project_name}-rds-sg"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_nodes" {
  security_group_id            = aws_security_group.rds.id
  referenced_security_group_id = module.eks.node_security_group_id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "PostgreSQL a partir dos nos do EKS"
}

module "rds" {
  source  = "terraform-aws-modules/rds/aws"
  version = "7.2.2"

  identifier = "${var.project_name}-postgres"

  engine               = "postgres"
  engine_version       = "16"
  family               = "postgres16"
  major_engine_version = "16"
  instance_class       = var.db_instance_class

  allocated_storage = var.db_allocated_storage
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = local.db_name
  username = local.db_username
  port     = 5432

  manage_master_user_password = false
  password_wo                 = random_password.db.result
  password_wo_version         = 1

  multi_az               = false
  publicly_accessible    = false
  db_subnet_group_name   = module.vpc.database_subnet_group_name
  vpc_security_group_ids = [aws_security_group.rds.id]

  create_db_option_group = false

  # Ambiente academico: destroy limpo, sem snapshot final.
  backup_retention_period = 1
  deletion_protection     = false
  skip_final_snapshot     = true
  apply_immediately       = true
}
