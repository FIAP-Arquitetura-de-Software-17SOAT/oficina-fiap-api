resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_github_oidc_provider ? 1 : 0

  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_openid_connect_provider" "github" {
  count = var.create_github_oidc_provider ? 0 : 1

  url = "https://token.actions.githubusercontent.com"
}

locals {
  github_oidc_provider_arn = (
    var.create_github_oidc_provider
    ? aws_iam_openid_connect_provider.github[0].arn
    : data.aws_iam_openid_connect_provider.github[0].arn
  )

  # Workflows que declaram "environment:" recebem outro subject
  # (repo:<repo>:environment:<nome>) e nao conseguem assumir esta role.
  github_oidc_subject = "repo:${var.github_repository}:ref:refs/heads/${var.github_branch}"

  account_id  = data.aws_caller_identity.current.account_id
  cluster_arn = "arn:aws:eks:${var.aws_region}:${local.account_id}:cluster/${local.cluster_name}"

  github_actions_trust_policy = {
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Action    = "sts:AssumeRoleWithWebIdentity"
        Principal = { Federated = local.github_oidc_provider_arn }
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
            "token.actions.githubusercontent.com:sub" = local.github_oidc_subject
          }
        }
      }
    ]
  }

  github_actions_permissions = {
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "EcrLogin"
        Effect   = "Allow"
        Action   = "ecr:GetAuthorizationToken"
        Resource = "*"
      },
      {
        Sid    = "EcrPushPull"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage",
        ]
        Resource = [
          for name in values(local.ecr_repositories) :
          "arn:aws:ecr:${var.aws_region}:${local.account_id}:repository/${name}"
        ]
      },
      {
        Sid      = "EksDescribeCluster"
        Effect   = "Allow"
        Action   = "eks:DescribeCluster"
        Resource = local.cluster_arn
      },
    ]
  }
}

resource "aws_iam_role" "github_actions" {
  name               = "${var.project_name}-github-actions"
  description        = "Assumida pelo GitHub Actions (OIDC) para publicar imagens no ECR e fazer deploy no EKS."
  assume_role_policy = jsonencode(local.github_actions_trust_policy)
}

resource "aws_iam_role_policy" "github_actions" {
  name   = "ecr-push-eks-describe"
  role   = aws_iam_role.github_actions.id
  policy = jsonencode(local.github_actions_permissions)
}
