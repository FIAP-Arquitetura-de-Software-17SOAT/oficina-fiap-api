run "state_bucket_is_hardened" {
  command = plan

  assert {
    condition     = aws_s3_bucket.state.bucket == "oficina-fiap-tfstate-${data.aws_caller_identity.current.account_id}"
    error_message = "Bucket do state deve se chamar oficina-fiap-tfstate-<account_id>."
  }

  assert {
    condition     = aws_s3_bucket_versioning.state.versioning_configuration[0].status == "Enabled"
    error_message = "Versionamento do bucket do state deve estar habilitado."
  }

  assert {
    condition     = one(one(aws_s3_bucket_server_side_encryption_configuration.state.rule).apply_server_side_encryption_by_default).sse_algorithm == "AES256"
    error_message = "Bucket do state deve usar SSE-S3 (AES256)."
  }

  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.state.block_public_acls,
      aws_s3_bucket_public_access_block.state.block_public_policy,
      aws_s3_bucket_public_access_block.state.ignore_public_acls,
      aws_s3_bucket_public_access_block.state.restrict_public_buckets,
    ])
    error_message = "Todo acesso publico ao bucket do state deve ser bloqueado."
  }

  assert {
    condition     = jsondecode(aws_s3_bucket_policy.state.policy).Statement[0].Effect == "Deny" && jsondecode(aws_s3_bucket_policy.state.policy).Statement[0].Condition.Bool["aws:SecureTransport"] == "false"
    error_message = "Bucket policy deve negar requisicoes sem TLS."
  }

  assert {
    condition     = output.backend_config == "bucket = \"oficina-fiap-tfstate-${data.aws_caller_identity.current.account_id}\"\nregion = \"us-east-1\"\n"
    error_message = "backend_config deve conter bucket e region no formato de backend.hcl."
  }
}
