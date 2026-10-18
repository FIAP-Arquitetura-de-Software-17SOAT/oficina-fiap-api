output "state_bucket_name" {
  description = "Bucket S3 que guarda o state do root infra/."
  value       = aws_s3_bucket.state.bucket
}

output "backend_config" {
  description = "Conteudo de infra/backend.hcl."
  value       = <<-EOT
    bucket = "${aws_s3_bucket.state.bucket}"
    region = "${var.aws_region}"
  EOT
}
