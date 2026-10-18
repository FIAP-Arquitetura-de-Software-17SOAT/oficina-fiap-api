locals {
  cluster_name             = "${var.project_name}-eks"
  cluster_admin_policy_arn = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  cluster_addons = {
    vpc-cni                = { before_compute = true }
    eks-pod-identity-agent = { before_compute = true }
    kube-proxy             = {}
    coredns                = {}
    # Necessario para o HPA escalar por CPU/memoria.
    metrics-server = {}
  }

  default_node_group = {
    ami_type       = "AL2023_x86_64_STANDARD"
    instance_types = var.node_instance_types
    capacity_type  = "ON_DEMAND"
    min_size       = var.node_min_size
    max_size       = var.node_max_size
    desired_size   = var.node_desired_size
    subnet_ids     = module.vpc.private_subnets

    metadata_options = {
      http_endpoint               = "enabled"
      http_tokens                 = "required"
      http_put_response_hop_limit = 1
    }
  }

  # Quem aplica ja recebe admin via enable_cluster_creator_admin_permissions;
  # repetir o ARN geraria uma access entry duplicada (ResourceInUseException).
  extra_cluster_admin_arns = [
    for arn in var.cluster_admin_principal_arns : arn
    if arn != data.aws_iam_session_context.current.issuer_arn
  ]

  cluster_access_entries = merge(
    {
      for arn in local.extra_cluster_admin_arns : arn => {
        principal_arn = arn
        policy_associations = {
          cluster_admin = {
            policy_arn   = local.cluster_admin_policy_arn
            access_scope = { type = "cluster" }
          }
        }
      }
    },
    {
      # CI/CD aplica os manifestos de /k8s (inclusive recursos de escopo
      # cluster, como Namespace).
      github-actions = {
        principal_arn = aws_iam_role.github_actions.arn
        policy_associations = {
          cluster_admin = {
            policy_arn   = local.cluster_admin_policy_arn
            access_scope = { type = "cluster" }
          }
        }
      }
    },
  )
}

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "21.29.0"

  name               = local.cluster_name
  kubernetes_version = var.kubernetes_version

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  # Endpoint publico: kubectl local e runners hospedados do GitHub Actions.
  endpoint_public_access       = true
  endpoint_private_access      = true
  endpoint_public_access_cidrs = var.endpoint_public_access_cidrs

  authentication_mode                      = "API"
  enable_cluster_creator_admin_permissions = true
  access_entries                           = local.cluster_access_entries

  cloudwatch_log_group_retention_in_days = 7

  addons = local.cluster_addons

  eks_managed_node_groups = {
    default = local.default_node_group
  }
}
