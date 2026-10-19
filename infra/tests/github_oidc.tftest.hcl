run "trust_only_main_branch" {
  command = plan

  assert {
    condition     = local.github_actions_trust_policy.Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] == "repo:FIAP-Arquitetura-de-Software-17SOAT/oficina-fiap-api:ref:refs/heads/main"
    error_message = "Trust deve aceitar somente a branch main do repositorio do grupo."
  }

  assert {
    condition     = local.github_actions_trust_policy.Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:aud"] == "sts.amazonaws.com"
    error_message = "Trust deve exigir audience sts.amazonaws.com."
  }

  assert {
    condition     = local.github_actions_trust_policy.Statement[0].Action == "sts:AssumeRoleWithWebIdentity"
    error_message = "Trust deve usar AssumeRoleWithWebIdentity."
  }

  assert {
    condition     = aws_iam_role.github_actions.name == "oficina-fiap-github-actions"
    error_message = "Role deve se chamar oficina-fiap-github-actions."
  }

  assert {
    condition     = length(aws_iam_openid_connect_provider.github) == 1 && one(aws_iam_openid_connect_provider.github).url == "https://token.actions.githubusercontent.com"
    error_message = "OIDC provider do GitHub deve ser criado por padrao."
  }
}

run "permissions_are_scoped" {
  command = plan

  assert {
    condition     = one([for s in local.github_actions_permissions.Statement : s.Resource if s.Sid == "EcrLogin"]) == "*"
    error_message = "ecr:GetAuthorizationToken exige Resource *."
  }

  assert {
    condition = toset(one([for s in local.github_actions_permissions.Statement : s.Resource if s.Sid == "EcrPushPull"])) == toset([
      for name in ["oficina-api", "oficina-migrator", "oficina-seeder"] :
      "arn:aws:ecr:us-east-1:${data.aws_caller_identity.current.account_id}:repository/${name}"
    ])
    error_message = "Push/pull deve ficar restrito aos 3 repositorios ECR."
  }

  assert {
    condition     = one([for s in local.github_actions_permissions.Statement : s.Resource if s.Sid == "EksDescribeCluster"]) == "arn:aws:eks:us-east-1:${data.aws_caller_identity.current.account_id}:cluster/oficina-fiap-eks"
    error_message = "eks:DescribeCluster deve ficar restrito ao cluster oficina-fiap-eks."
  }
}

run "trust_follows_configured_branch" {
  command = plan

  variables {
    github_branch = "develop"
  }

  assert {
    condition     = local.github_oidc_subject == "repo:FIAP-Arquitetura-de-Software-17SOAT/oficina-fiap-api:ref:refs/heads/develop"
    error_message = "Subject deve refletir exatamente a branch configurada."
  }
}

run "rejects_wildcard_branch" {
  command = plan

  variables {
    github_branch = "*"
  }

  expect_failures = [var.github_branch]
}

run "rejects_malformed_repository" {
  command = plan

  variables {
    github_repository = "FIAP-Arquitetura-de-Software-17SOAT/*"
  }

  expect_failures = [var.github_repository]
}

run "reuses_existing_oidc_provider" {
  command = plan

  variables {
    create_github_oidc_provider = false
  }

  override_data {
    target          = data.aws_iam_openid_connect_provider.github
    override_during = plan
    values = {
      arn = "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com"
    }
  }

  assert {
    condition     = length(aws_iam_openid_connect_provider.github) == 0
    error_message = "Com create_github_oidc_provider = false o provider nao deve ser criado."
  }

  assert {
    condition     = local.github_actions_trust_policy.Statement[0].Principal.Federated == "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com"
    error_message = "Trust deve usar o ARN do provider existente."
  }
}
