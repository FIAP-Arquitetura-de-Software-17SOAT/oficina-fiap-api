# Kubernetes da Oficina FIAP

Manifestos da API para rodar em **kind** (local) e **EKS** (AWS). A mesma base serve
aos dois; cada ambiente so troca imagens e alguns valores. Para entender cada arquivo e
cada campo do YAML, veja [docs/wiki/kubernetes.md](../docs/wiki/kubernetes.md). A infra
(cluster, ECR, RDS) vem do [Terraform](../infra/README.md).

## Estrutura

```text
k8s/
  namespace.yaml                  namespace "oficina" (1o passo do deploy)
  base/
    app/                          a API: igual em qualquer ambiente
      configmap.yaml
      deployment.yaml
      service.yaml
      hpa.yaml
      kustomization.yaml
    jobs/
      db-setup-job.yaml           migration + admin inicial, roda antes da API
      kustomization.yaml
  overlays/                       o que muda por ambiente (imagens e valores)
    local/app/kustomization.yaml
    local/jobs/kustomization.yaml
    eks/app/kustomization.yaml
    eks/jobs/kustomization.yaml
  secrets/                        MODELOS de Secret, sem valores reais
    secret.example.yaml
    seed-secret.example.yaml
```

Usamos **Kustomize**, que ja vem dentro do `kubectl` (`kubectl apply -k`). Nao ha script
nem gerador: `base/` descreve o que existe e `overlays/<ambiente>/` o que muda.
`kubectl kustomize k8s/overlays/eks/app` mostra o YAML final sem aplicar nada.

**Nao aplique `base/` nem `secrets/` diretamente:** a base nao tem imagem nem valores de
ambiente, os modelos de Secret nao sao configuracao real, e a migration precisa terminar
antes da atualizacao da API. Use sempre os overlays, na ordem abaixo.

## Recursos criados

| Arquivo | Recurso | Para que serve |
| --- | --- | --- |
| `namespace.yaml` | Namespace `oficina` | Agrupa tudo dentro do cluster |
| `base/app/configmap.yaml` | ConfigMap `oficina-api-config` | Configuracao nao secreta da API |
| `base/app/deployment.yaml` | Deployment `oficina-api` | Pods da API, probes, recursos e troca gradual |
| `base/app/service.yaml` | Service `oficina-api` | Endereco estavel (ClusterIP no kind, LoadBalancer no EKS) |
| `base/app/hpa.yaml` | HorizontalPodAutoscaler `oficina-api` | 2 a 4 replicas por CPU (70%) e memoria (80%) |
| `base/jobs/db-setup-job.yaml` | Job `oficina-db-setup` | Migration e admin inicial, antes da API |
| `secrets/*.example.yaml` | Modelos de Secret | `oficina-api-secrets` e `oficina-seed-secrets`, criados fora do Git |

## Ordem de deploy (vale para kind e EKS)

Troque `local` por `eks` para a AWS. Antes de qualquer comando, confira o cluster
alvo com `kubectl config current-context`.

```bash
# 1. Namespace e Secrets (os Secrets sao criados fora do Git; veja as secoes abaixo)
kubectl apply -f k8s/namespace.yaml

# 2. Banco: migration e admin inicial. Job nao pode ser alterado: apague o anterior.
kubectl -n oficina delete job oficina-db-setup --ignore-not-found
kubectl apply -k k8s/overlays/local/jobs
kubectl -n oficina wait --for=condition=complete job/oficina-db-setup --timeout=300s

# 3. API (so depois de o passo 2 terminar com sucesso)
kubectl apply -k k8s/overlays/local/app
kubectl -n oficina rollout status deployment/oficina-api --timeout=300s
```

Se o passo 2 falhar, **nao siga**: veja `kubectl -n oficina logs job/oficina-db-setup -c migrate`
(ou `-c seed`), corrija e repita. O banco nao tem rollback automatico: escreva
migrations compativeis com a versao anterior da API, que continua rodando durante a troca.

O `deployment.yaml` nao tem `replicas`; quem decide e o HPA (minimo 2). So na primeira
vez que se migra de um Deployment que ja tinha `replicas`, o `apply` o volta a 1 por
alguns segundos ate o HPA reconduzir a 2.

## Local com kind

Pre-requisitos: Docker (OrbStack), `kind`, `kubectl`, PostgreSQL do Compose no ar
(`docker compose up -d db`).

```bash
# Cluster e imagens (as tres saem do mesmo Dockerfile, targets diferentes)
kind create cluster --name oficina-fiap-local-1    # se ainda nao existir
docker build --target runtime  -t oficina-api:local .
docker build --target migrator -t oficina-migrator:local .
docker build --target seeder   -t oficina-seeder:local .
kind load docker-image oficina-api:local oficina-migrator:local oficina-seeder:local \
  --name oficina-fiap-local-1
kubectl config use-context kind-oficina-fiap-local-1
```

**Secrets locais.** Crie `k8s/.env.local` (ignorado pelo Git) com `CHAVE=valor`, sem
`export` e sem aspas: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SMTP_USER`, `SMTP_PASSWORD`. Para o admin,
crie `k8s/.env.seed.local` com `ADMIN_EMAIL` e `ADMIN_PASSWORD`. Dentro de um Pod,
`localhost` e o proprio Pod: a `DATABASE_URL` local usa `host.docker.internal:5432`
para chegar ao PostgreSQL do Compose.

```bash
kubectl -n oficina create secret generic oficina-api-secrets \
  --from-env-file=k8s/.env.local --dry-run=client -o yaml | kubectl apply -f -
kubectl -n oficina create secret generic oficina-seed-secrets \
  --from-env-file=k8s/.env.seed.local --dry-run=client -o yaml | kubectl apply -f -
```

Depois siga a **ordem de deploy** acima com `overlays/local`. Para abrir a API no Mac:

```bash
kubectl -n oficina port-forward service/oficina-api 3000:80
curl -f http://localhost:3000/health     # Swagger: http://localhost:3000/api/v1/docs
```

**Metrics Server** (necessario para o HPA). Num kind novo:

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/download/v0.9.0/components.yaml
kubectl -n kube-system patch deployment metrics-server --type=json \
  -p '[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
kubectl top nodes
```

`--kubelet-insecure-tls` e so para o kind. **Nao use no EKS.**

## EKS

### O que o Terraform precisa entregar

1. **Cluster EKS** com acesso para o CD (`aws eks update-kubeconfig`). Capacidade para
   4 Pods da API (cada um reserva 100m de CPU e 384Mi) mais 1 Pod extra durante a
   atualizacao, mais o Metrics Server e o sistema. Sugestao: 2 nos com ~2 vCPU e 4 GiB.
2. **ECR** com tres repositorios: `oficina-api`, `oficina-migrator` e `oficina-seeder`,
   e permissao para os nos baixarem imagens.
3. **RDS PostgreSQL** alcancavel pelos nos (security group liberando a porta 5432) e o
   endereco do banco, para montar a `DATABASE_URL`.
4. **Metrics Server** instalado, sem `--kubelet-insecure-tls`.
5. **Sub-redes publicas** com a tag `kubernetes.io/role/elb=1`, para o balanceador.

### Secrets no EKS (uma vez)

Quem tem acesso admin ao cluster cria os dois Secrets **uma unica vez**. Eles ficam no
cluster entre os deploys e o CD nao os recria (a role do CI nao le o state do Terraform).
A `DATABASE_URL` vem do Terraform e deve ser usada sem alteracoes.

```bash
$(terraform -chdir=infra output -raw configure_kubectl)   # aponta o kubectl para o EKS
kubectl config current-context                            # confira antes de continuar
kubectl apply -f k8s/namespace.yaml
# k8s/.env.eks (ignorado pelo Git): as mesmas chaves do .env.local, com
#   DATABASE_URL=<terraform -chdir=infra output -raw database_url>
#   JWT_ACCESS_SECRET e JWT_REFRESH_SECRET novos (openssl rand -base64 48), chave Stripe de teste
# k8s/.env.seed.eks (ignorado pelo Git): ADMIN_EMAIL e ADMIN_PASSWORD
kubectl -n oficina create secret generic oficina-api-secrets \
  --from-env-file=k8s/.env.eks --dry-run=client -o yaml | kubectl apply -f -
kubectl -n oficina create secret generic oficina-seed-secrets \
  --from-env-file=k8s/.env.seed.eks --dry-run=client -o yaml | kubectl apply -f -
```

### O que o CD precisa fazer

As tres imagens usam a **mesma tag, o SHA do commit**, e vem do mesmo Dockerfile
(`--target runtime`, `migrator` e `seeder`). Os overlays `eks` trazem marcadores
`TROQUE_*`; o CD os substitui e aplica na ordem acima:

```bash
SHA=$(git rev-parse --short=7 HEAD)
ECR=<account-id>.dkr.ecr.<regiao>.amazonaws.com
sed -i.bak -e "s/TROQUE_ACCOUNT_ID/<account-id>/g" -e "s/TROQUE_REGIAO/<regiao>/g" \
  -e "s/TROQUE_SHA_DO_COMMIT/$SHA/g" \
  k8s/overlays/eks/app/kustomization.yaml k8s/overlays/eks/jobs/kustomization.yaml

kubectl apply -f k8s/namespace.yaml
# Secrets (oficina-api-secrets e oficina-seed-secrets): ja existem, criados uma vez
# (secao anterior). O CD nao os recria.
kubectl -n oficina delete job oficina-db-setup --ignore-not-found
kubectl apply -k k8s/overlays/eks/jobs
kubectl -n oficina wait --for=condition=complete job/oficina-db-setup --timeout=300s
kubectl apply -k k8s/overlays/eks/app
kubectl -n oficina rollout status deployment/oficina-api --timeout=300s
```

Se preferir, `kustomize edit set image` (binario `kustomize` a parte) faz a mesma troca.
Nunca rode dois deploys ao mesmo tempo: o pipeline deve serializa-los.

### Endereco publico

O `overlays/eks/app` torna o Service `oficina-api` um **LoadBalancer**: a AWS cria um
Network Load Balancer. O endereco dele so existe depois do primeiro deploy:

```bash
kubectl -n oficina get service oficina-api   # coluna EXTERNAL-IP (hostname do NLB)
```

Coloque esse hostname no lugar de `TROQUE_ENDERECO_DO_BALANCEADOR` no
`overlays/eks/app/kustomization.yaml` (ele alimenta `PUBLIC_API_URL`, usada nos links de
aprovacao de orcamento enviados por e-mail, e as URLs de retorno do pagamento), aplique de
novo e reinicie: um ConfigMap alterado **nao** reinicia os Pods sozinho.

```bash
kubectl apply -k k8s/overlays/eks/app
kubectl -n oficina rollout restart deployment/oficina-api
```

Esta em HTTP, sem dominio nem certificado. HTTPS exigiria um dominio e um certificado ACM
(anotacoes `aws-load-balancer-ssl-cert` e porta 443 no Service); o webhook do Stripe, que
so entrega em HTTPS, nao funcionaria em HTTP.

O tipo de balanceador depende do que o cluster tem instalado. O Terraform atual (PR #71)
nao instala o AWS Load Balancer Controller nem usa o Auto Mode, entao vale a primeira
linha da tabela. **Nada disso foi testado na AWS: o primeiro deploy real confirma.**

| O cluster tem | Ajuste no Service do `overlays/eks/app` |
| --- | --- |
| Nada alem do EKS (padrao) | Como esta: `type: LoadBalancer` + `aws-load-balancer-type: nlb` |
| AWS Load Balancer Controller | `spec.loadBalancerClass: service.k8s.aws/nlb` e anotacao `aws-load-balancer-nlb-target-type: ip`, sem `aws-load-balancer-type` |
| EKS Auto Mode | `spec.loadBalancerClass: eks.amazonaws.com/nlb` |

### Pontos de atencao

- **Arquitetura da imagem.** Imagem feita num Mac (arm64) nao roda em nos x86 (`exec format
  error`). No CD, o runner do GitHub e x86, entao nao ha problema; localmente, use
  `docker buildx build --platform linux/amd64`.
- **SSL do RDS.** Use a `database_url` do Terraform **sem alteracoes**: ela ja termina em
  `?sslmode=require&uselibpqcompat=true`. O `pg` desta versao (8.22) trata `sslmode=require`
  sozinho como `verify-full`, e o certificado do RDS nao esta no Node; o
  `uselibpqcompat=true` faz o driver cifrar sem validar essa CA. Quem fez o Terraform
  validou a migration (Prisma) e o driver `pg` com essa URL. A API e o seed ainda nao
  foram testados contra o RDS.
- **Capacidade.** O Terraform cria 2 nos `t3.small` (2 GiB cada, maximo 2). No pico, 4 Pods
  mais 1 extra na troca reservam 5 x 384Mi ~ 1,9 GiB, fora o sistema e o Job (256Mi).
  Deve caber, mas e o primeiro ponto a observar: se um Pod ficar `Pending`, veja
  `kubectl -n oficina describe pod <nome>` (`Insufficient memory`). Saidas: nos maiores
  (conta Paid) ou rever os `requests` com as metricas reais.
- **Destruir o ambiente.** Antes do `terraform destroy`, rode `kubectl delete namespace
  oficina`: isso remove o Service e, com ele, o balanceador. Um NLB criado pelo Kubernetes
  nao e do Terraform e impede a exclusao da VPC. Espere
  `kubectl get svc -A | grep LoadBalancer` voltar vazio. O ambiente custa cerca de
  US$ 0,21 por hora ligado: destrua quando nao estiver usando.
- **Secrets.** Base64 nao e criptografia. Quem controla o acesso ao cluster controla os
  segredos. Nunca versione uma copia preenchida.

## Operacao e diagnostico

```bash
kubectl -n oficina get deployment,pods,svc,jobs,hpa   # visao geral
kubectl -n oficina get pods -w                        # acompanha ao vivo (Ctrl+C sai)
kubectl -n oficina top pods                           # CPU e memoria
kubectl -n oficina logs -l app=oficina-api --tail=50  # logs da API
kubectl -n oficina describe pod <nome>                # eventos e motivo de falha
kubectl -n oficina get events --sort-by=.lastTimestamp
kubectl -n oficina rollout history deployment/oficina-api
kubectl -n oficina rollout undo deployment/oficina-api   # volta a versao da API
```

`rollout undo` troca so a API: nao desfaz migrations nem o ConfigMap.

| Sintoma | Conferir |
| --- | --- |
| `ImagePullBackOff` | endereco e tag da imagem; no kind, faltou `kind load`; no EKS, ECR, permissao e arquitetura |
| `CreateContainerConfigError` | o Secret ou o ConfigMap existe e tem todas as chaves (nao imprima o Secret) |
| `CrashLoopBackOff` | `logs --previous`; segredos JWT (32 bytes em producao), chave Stripe de teste |
| Pod nao fica Ready | `/health` consulta o banco: `DATABASE_URL`, rede, SSL, migrations |
| HPA com `<unknown>` | Metrics Server, `top pods`, e esperar a primeira coleta |
| Pod `Pending` | capacidade dos nos (`describe pod`, secao Events) |
| EXTERNAL-IP `<pending>` | controlador de balanceador, anotacoes, sub-redes e eventos do Service |
| Job falhou | `logs job/oficina-db-setup -c migrate` ou `-c seed`; corrija e repita o passo 2 |

## Validar antes de entregar

```bash
kubectl kustomize k8s/overlays/local/app  > /dev/null && echo ok
kubectl kustomize k8s/overlays/local/jobs > /dev/null && echo ok
kubectl kustomize k8s/overlays/eks/app    > /dev/null && echo ok
kubectl kustomize k8s/overlays/eks/jobs   > /dev/null && echo ok
kubectl apply --dry-run=server -k k8s/overlays/local/app   # valida contra o cluster atual
```
