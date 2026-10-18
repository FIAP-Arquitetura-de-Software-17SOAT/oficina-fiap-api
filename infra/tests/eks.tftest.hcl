run "cluster_configuration" {
  command = plan

  assert {
    condition     = module.eks.cluster_name == "oficina-fiap-eks"
    error_message = "Cluster deve se chamar oficina-fiap-eks."
  }

  assert {
    condition     = var.kubernetes_version == "1.37"
    error_message = "Versao padrao do Kubernetes deve ser 1.37."
  }

  assert {
    condition     = toset(keys(local.cluster_addons)) == toset(["vpc-cni", "eks-pod-identity-agent", "kube-proxy", "coredns", "metrics-server"])
    error_message = "Add-ons devem ser vpc-cni, eks-pod-identity-agent, kube-proxy, coredns e metrics-server."
  }

  assert {
    condition     = local.cluster_addons["vpc-cni"].before_compute && local.cluster_addons["eks-pod-identity-agent"].before_compute
    error_message = "vpc-cni e eks-pod-identity-agent devem ser instalados antes dos nos."
  }

  assert {
    condition = (
      local.default_node_group.instance_types == tolist(["t3.medium"]) &&
      local.default_node_group.capacity_type == "ON_DEMAND" &&
      local.default_node_group.min_size == 2 &&
      local.default_node_group.desired_size == 2 &&
      local.default_node_group.max_size == 4
    )
    error_message = "Node group padrao deve ser t3.medium ON_DEMAND, min 2, desired 2, max 4."
  }

  assert {
    condition     = local.default_node_group.metadata_options.http_tokens == "required"
    error_message = "Nos devem exigir IMDSv2."
  }

  assert {
    condition     = output.configure_kubectl == "aws eks update-kubeconfig --region us-east-1 --name oficina-fiap-eks"
    error_message = "configure_kubectl deve trazer o comando update-kubeconfig do cluster."
  }
}

run "extra_cluster_admins_get_access_entries" {
  command = plan

  variables {
    cluster_admin_principal_arns = ["arn:aws:iam::111122223333:user/colega"]
  }

  assert {
    condition     = local.cluster_access_entries["arn:aws:iam::111122223333:user/colega"].policy_associations.cluster_admin.policy_arn == "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"
    error_message = "Colegas listados devem receber AmazonEKSClusterAdminPolicy."
  }

  assert {
    condition     = local.cluster_access_entries["arn:aws:iam::111122223333:user/colega"].policy_associations.cluster_admin.access_scope.type == "cluster"
    error_message = "Acesso de colegas deve ter escopo de cluster."
  }
}

run "caller" {
  command = plan

  module {
    source = "./tests/helpers/caller"
  }
}

run "creator_is_not_duplicated_as_admin" {
  command = plan

  variables {
    cluster_admin_principal_arns = [run.caller.issuer_arn, "arn:aws:iam::111122223333:user/colega"]
  }

  assert {
    condition     = !contains(keys(local.cluster_access_entries), run.caller.issuer_arn)
    error_message = "ARN de quem aplica ja e admin como criador e nao pode virar access entry duplicada."
  }

  assert {
    condition     = contains(keys(local.cluster_access_entries), "arn:aws:iam::111122223333:user/colega")
    error_message = "Demais ARNs devem continuar na lista."
  }
}

run "rejects_desired_size_above_max" {
  command = plan

  variables {
    node_desired_size = 5
    node_max_size     = 4
  }

  expect_failures = [var.node_desired_size]
}

run "rejects_min_size_above_desired" {
  command = plan

  variables {
    node_min_size     = 3
    node_desired_size = 2
  }

  expect_failures = [var.node_desired_size]
}
