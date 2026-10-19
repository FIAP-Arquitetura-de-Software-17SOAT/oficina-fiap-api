data "aws_caller_identity" "current" {}

# Resolve o ARN "de origem" de quem aplica (usuario IAM ou role, mesmo
# quando a sessao e um assumed-role). E o mesmo ARN que o modulo EKS usa
# para a access entry do criador.
data "aws_iam_session_context" "current" {
  arn = data.aws_caller_identity.current.arn
}
