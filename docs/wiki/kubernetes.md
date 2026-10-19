# Kubernetes

Como o Kubernetes funciona neste projeto e o que cada arquivo de `k8s/` faz. O passo a passo para executar o deploy (kind e EKS), os Secrets e o diagnostico estao em [k8s/README.md](../../k8s/README.md); o que o Terraform entrega esta na pasta `infra/` (veja `infra/README.md`).

## Como o Kubernetes funciona

O Docker empacota a API numa imagem. O Kubernetes decide onde e quantas copias dessa imagem rodam, troca as que falham e ajusta a quantidade conforme o consumo.

A ideia central e o **estado desejado**: em vez de mandar "suba um container", escreve-se num YAML "quero 2 copias desta imagem" e entrega-se ao cluster. Controladores comparam continuamente o que foi pedido com o que existe e corrigem a diferenca. Se um Pod morre, outro e criado sem ninguem pedir.

| Termo        | No projeto                                                                             |
| ------------ | -------------------------------------------------------------------------------------- |
| Cluster      | O conjunto todo. No kind, um no dentro de um container; no EKS, a AWS cuida do control plane |
| Node (no)    | Maquina que oferece CPU e memoria para os Pods                                         |
| Pod          | Menor unidade de execucao: aqui, um container da API                                   |
| Replica      | Mais uma copia do mesmo Pod                                                            |
| Namespace    | Agrupa recursos; usamos `oficina`                                                      |
| Deployment   | Mantem as replicas e faz a troca gradual de versao                                     |
| Service      | Endereco estavel que distribui conexoes entre os Pods prontos                          |
| ConfigMap    | Configuracao nao secreta                                                               |
| Secret       | Credenciais (banco, JWT, Stripe, SMTP)                                                 |
| Job          | Tarefa que roda ate terminar (migration e admin inicial)                               |
| HPA          | Ajusta o numero de replicas pelas metricas de CPU e memoria                            |
| Metrics Server | Coleta CPU e memoria e fornece ao HPA                                                |

## Anatomia de um manifesto

Todo YAML do Kubernetes tem quatro campos no topo:

```yaml
apiVersion: apps/v1     # versao da API do Kubernetes que define o tipo
kind: Deployment        # o tipo de recurso
metadata:               # identidade: nome, namespace, labels
  name: oficina-api
  namespace: oficina
spec:                   # o estado desejado (cada tipo tem os seus campos)
```

**Labels e selectors ligam as pecas.** Um label e uma etiqueta (`app: oficina-api`) colada num recurso; um selector procura recursos por etiqueta. Nenhum recurso aponta para o nome de um Pod:

```text
Deployment.selector e template.labels  ->  Pods com label app=oficina-api  <-  Service.selector
HPA.scaleTargetRef                     ->  Deployment oficina-api
```

O Service nao guarda uma lista de Pods: guarda uma busca. Quando um Pod e recriado com outro IP, a lista de destinos se atualiza sozinha. Se a readiness probe de um Pod falha, ele sai da lista sem ser reiniciado.

## Os recursos do projeto

### Deployment (`k8s/base/app/deployment.yaml`)

Cadeia de donos: Deployment -> ReplicaSet -> Pods. O ReplicaSet garante "N Pods deste molde"; cada mudanca no molde (imagem, variaveis, probes) cria um ReplicaSet novo, e o hash no nome do Pod (`oficina-api-7965b98bf7-...`) identifica a versao. Apagar o Deployment apaga os ReplicaSets e os Pods em cascata.

| Campo                                              | O que faz                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `selector.matchLabels` e `template.metadata.labels` | Como o Deployment reconhece os Pods dele; precisam coincidir                                |
| sem `replicas`                                     | Quem decide a quantidade e o HPA; com o valor aqui, todo `apply` desfaria a escala         |
| `strategy.rollingUpdate` (`maxSurge: 1`, `maxUnavailable: 0`) | Sobe 1 Pod novo e so entao remove um antigo; nunca fica abaixo do desejado       |
| `revisionHistoryLimit: 3`                          | Guarda 3 ReplicaSets antigos, usados pelo `rollout undo`                                    |
| `image`                                            | Nome provisorio (`oficina-api`); o overlay coloca o caminho e a tag reais                   |
| `envFrom`                                          | Injeta o ConfigMap e o Secret como variaveis de ambiente                                    |
| `resources.requests`                               | O que o Pod reserva (100m de CPU, 384Mi); base do agendamento e dos percentuais do HPA      |
| `resources.limits`                                 | O teto (500m, 512Mi); CPU acima sofre throttling, memoria acima mata o container (OOMKilled) |
| `securityContext`                                  | Roda sem root (usuario 1000), sem privilegios extras                                        |
| `terminationGracePeriodSeconds: 30`                | Tempo para a API fechar conexoes ao receber o aviso de desligamento                         |
| `topologySpreadConstraints`                        | Prefere espalhar as replicas em nos diferentes                                              |

As tres probes verificam coisas diferentes, de proposito:

| Probe     | Caminho   | Comportamento                                                           | Quando falha                          |
| --------- | --------- | ----------------------------------------------------------------------- | ------------------------------------- |
| startup   | `/live`   | Ate 30 tentativas a cada 5 s (~150 s) para a API subir                  | O container e reiniciado              |
| readiness | `/health` | A cada 5 s; consulta o banco                                            | O Pod sai do Service, sem reiniciar   |
| liveness  | `/live`   | A cada 10 s; nao consulta o banco                                       | O container e reiniciado              |

Se a liveness consultasse o banco, uma queda do banco reiniciaria todas as APIs em loop.

Como `envFrom` nao e opcional, o Pod nao inicia (`CreateContainerConfigError`) se o ConfigMap ou o Secret nao existir. Por isso os Secrets vem antes da API no deploy.

### Service (`k8s/base/app/service.yaml`)

Endereco estavel `oficina-api`, porta 80, que reparte as conexoes entre os Pods Ready e encaminha para a porta 3000. No kind e `ClusterIP` (so dentro do cluster; acesso pelo Mac com `port-forward`). No EKS o overlay muda o tipo para `LoadBalancer` e a AWS cria o balanceador publico.

### ConfigMap e Secret

O ConfigMap (`k8s/base/app/configmap.yaml`) guarda o que nao e secreto: porta, duracao dos tokens, SMTP. Todo valor e texto (`"3000"` entre aspas). O que muda por ambiente (`NODE_ENV`, `LOG_LEVEL`, URLs publicas) fica nos overlays.

Os modelos em `k8s/secrets/` (`secret.example.yaml` e `seed-secret.example.yaml`) listam as chaves de banco, JWT, Stripe, SMTP e do admin inicial, sem valores. Os Secrets reais sao criados no cluster com `kubectl create secret --from-env-file` e nunca vao para o Git. Base64 nao e criptografia: quem acessa o cluster le os segredos.

### HPA (`k8s/base/app/hpa.yaml`)

Mantem entre 2 e 4 replicas. Le CPU e memoria do Metrics Server e compara com o alvo: 70% de CPU e 80% de memoria, em relacao ao `request` do Pod (70m e cerca de 307Mi por Pod). Com duas metricas, vale a que pedir mais replicas. O bloco `behavior` sobe rapido (ate 2 Pods por minuto) e desce devagar (espera 5 min e tira 1 Pod por minuto), o que evita oscilar. O HPA cria Pods, nao maquinas: se faltar capacidade nos nos, o Pod fica `Pending`.

### Job de banco (`k8s/base/jobs/db-setup-job.yaml`)

Prepara o banco em dois passos, sempre em ordem: o `initContainer` `migrate` aplica as migrations do Prisma e, so se terminar com sucesso, o container `seed` cria o administrador inicial (repetir nao tem efeito). Fica fora da API porque a migration precisa terminar antes da atualizacao da API. Um Job nao pode ser alterado depois de criado, entao o nome e fixo e o deploy apaga o anterior antes de aplicar.

## Ordem do deploy

```text
namespace -> Secrets -> Job de banco (migration + admin) -> API
```

A API nova pode depender do schema novo: a migration roda e termina antes de a API ser atualizada, e se falhar o deploy para. Os comandos estao em [k8s/README.md](../../k8s/README.md#ordem-de-deploy-vale-para-kind-e-eks).

## Kustomize e overlays

`k8s/base/` descreve o que existe; `k8s/overlays/<ambiente>/` descreve o que muda. O Kustomize vem embutido no `kubectl` (`kubectl apply -k`) e dispensa scripts: `kubectl kustomize k8s/overlays/eks/app` mostra o YAML final sem aplicar.

| O overlay muda           | `local` (kind)       | `eks` (AWS)                            |
| ------------------------ | -------------------- | -------------------------------------- |
| Imagem (`images:`)       | `oficina-api:local`  | `<ecr>/oficina-api:<sha do commit>`    |
| `NODE_ENV` e `LOG_LEVEL` | development e debug  | production e info                      |
| URLs publicas            | `localhost:3000`     | endereco do balanceador                |
| Service                  | `ClusterIP`          | `LoadBalancer` (NLB)                   |

## Comandos do dia a dia

Confira o cluster alvo antes de alterar: `kubectl config current-context`. Todos com `-n oficina`.

| Comando                                             | Para que serve                                          |
| --------------------------------------------------- | ------------------------------------------------------- |
| `kubectl config get-contexts`                       | Lista os clusters configurados                          |
| `kubectl get pods` / `get pods -w`                  | Pods e estado; `-w` acompanha ao vivo                   |
| `kubectl get deployment,svc,hpa,jobs`               | Visao geral                                             |
| `kubectl top pods`                                  | CPU e memoria consumidas                                |
| `kubectl describe pod <nome>`                       | Eventos e motivo de uma falha (secao Events)            |
| `kubectl logs -l app=oficina-api --tail=50`         | Logs da API                                             |
| `kubectl logs job/oficina-db-setup -c migrate`      | Resultado da migration (`-c seed` para o admin)         |
| `kubectl rollout status deployment/oficina-api`     | Espera a atualizacao terminar                           |
| `kubectl rollout undo deployment/oficina-api`       | Volta a versao anterior da API (nao desfaz migrations)  |
| `kubectl port-forward service/oficina-api 3000:80`  | Abre a API no computador                                |
| `kubectl apply -k <pasta>`                          | Cria ou atualiza o que esta descrito (declarativo)      |
| `kubectl kustomize <pasta>`                         | Mostra o YAML final, sem aplicar                        |

`apply` declara o estado desejado e pode ser repetido; `delete` apaga e exige conferir o alvo. A escala automatica e do HPA: nao use `kubectl scale` durante uma demonstracao.

## Decisoes

- **Kustomize em vez de scripts ou Helm.** Ja vem no `kubectl`, os overlays sao YAML puro e curtos, e nao ha codigo para manter. Helm traria templates e um segundo binario para pouca vantagem aqui.
- **Sem `replicas` no Deployment.** O HPA manda; so na primeira migracao de um Deployment que ja tinha `replicas`, o `apply` o volta a 1 por alguns segundos ate o HPA reconduzir ao minimo.
- **Um Job unico para banco e admin.** Os `initContainers` garantem a ordem migration e seed sem script de espera.
- **Banco fora do cluster.** Os Pods da API sao descartaveis; o banco guarda dados e tem estrategia propria (PostgreSQL do Compose no kind, RDS no EKS).
- **Duas replicas no minimo.** Outra copia atende se uma falhar ou estiver sendo atualizada; resistir a queda de um no exige tambem nos diferentes.
