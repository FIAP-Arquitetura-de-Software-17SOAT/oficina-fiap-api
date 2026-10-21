# Rede da infraestrutura (VPC)

Este documento explica a rede que o Terraform cria na AWS para o projeto: a
VPC, as subnets, as rotas, as saidas para a internet e os firewalls. Para
cada peca, diz **o que e**, **como foi configurada** e **por que foi criada
assim**.

Codigo: [`infra/network.tf`](../../infra/network.tf) (rede), com os firewalls
em [`infra/eks.tf`](../../infra/eks.tf) e [`infra/rds.tf`](../../infra/rds.tf).
Siglas: [acronimos-infraestrutura.md](acronimos-infraestrutura.md). Visao
geral do Terraform: [infraestrutura-terraform.md](infraestrutura-terraform.md).

## Sumario

1. [Resumo](#1-resumo)
2. [Por que uma VPC propria](#2-por-que-uma-vpc-propria)
3. [Conceitos em uma linha](#3-conceitos-em-uma-linha)
4. [Mapa de enderecos](#4-mapa-de-enderecos)
5. [As tres camadas de subnets](#5-as-tres-camadas-de-subnets)
6. [Duas zonas de disponibilidade](#6-duas-zonas-de-disponibilidade)
7. [Saida e entrada da internet: IGW, NAT e EIP](#7-saida-e-entrada-da-internet-igw-nat-e-eip)
8. [Tabelas de rotas](#8-tabelas-de-rotas)
9. [Itens padrao da VPC](#9-itens-padrao-da-vpc)
10. [Firewalls: security groups](#10-firewalls-security-groups)
11. [Caminhos do trafego](#11-caminhos-do-trafego)
12. [Escolhas, custos e limites](#12-escolhas-custos-e-limites)
13. [Como alterar](#13-como-alterar)
14. [Perguntas comuns](#14-perguntas-comuns)

---

## 1. Resumo

```
                               Internet
                                  |
                        [Internet Gateway]
                                  |
  +-------------------------------+----------------------------------------+
  | VPC oficina-fiap-vpc   10.0.0.0/16                                     |
  |                                                                        |
  |         us-east-1a                          us-east-1b                 |
  |  +------------------------------+   +------------------------------+   |
  |  | PUBLICA  10.0.0.0/24         |   | PUBLICA  10.0.1.0/24         |   |
  |  |  [NAT Gateway + Elastic IP]  |   |                              |   |
  |  |  (Load Balancers do K8s)     |   |  (Load Balancers do K8s)     |   |
  |  +------------------------------+   +------------------------------+   |
  |                 |  rota 0.0.0.0/0 -> NAT (para as 4 abaixo)            |
  |  +------------------------------+   +------------------------------+   |
  |  | PRIVADA  10.0.10.0/24        |   | PRIVADA  10.0.11.0/24        |   |
  |  |  [no EKS] pods da API, Jobs  |   |  [no EKS] pods da API, Jobs  |   |
  |  +------------------------------+   +------------------------------+   |
  |  +------------------------------+   +------------------------------+   |
  |  | BANCO    10.0.20.0/24        |   | BANCO    10.0.21.0/24        |   |
  |  |  [RDS PostgreSQL]            |   |  (reserva do subnet group)   |   |
  |  +------------------------------+   +------------------------------+   |
  +------------------------------------------------------------------------+
```

| O que | Quantidade | Detalhe |
| --- | --- | --- |
| VPC | 1 | `oficina-fiap-vpc`, `10.0.0.0/16` |
| Subnets publicas | 2 | `10.0.0.0/24` (1a), `10.0.1.0/24` (1b) |
| Subnets privadas | 2 | `10.0.10.0/24` (1a), `10.0.11.0/24` (1b) |
| Subnets de banco | 2 | `10.0.20.0/24` (1a), `10.0.21.0/24` (1b) |
| DB subnet group | 1 | Agrupa as 2 subnets de banco para o RDS |
| Internet Gateway | 1 | Liga a VPC a internet |
| NAT Gateway | 1 | Na subnet publica de `us-east-1a` |
| Elastic IP | 1 | IP publico fixo do NAT |
| Tabelas de rotas | 2 (+ a padrao) | Publica e privada |
| Rotas | 2 | `0.0.0.0/0` -> Internet Gateway; `0.0.0.0/0` -> NAT |
| Associacoes de rota | 6 | Uma por subnet |
| Itens padrao adotados | 3 | Security group, network ACL e tabela de rotas padrao |

Sao **24 recursos** do modulo `terraform-aws-modules/vpc/aws` (versao 6.7.3),
mais os security groups criados junto com o cluster e o banco (item 10).

---

## 2. Por que uma VPC propria

Toda conta AWS ja vem com uma "VPC padrao", mas ela nao foi usada porque:

- **Todas as subnets da VPC padrao sao publicas.** Qualquer maquina criada ali
  pode receber IP publico e ficar exposta. O projeto quer os nos do cluster e
  o banco sem acesso pela internet.
- **Ela nao e criada pelo Terraform.** Outra pessoa (ou outra conta) teria uma
  VPC padrao diferente; o ambiente deixaria de ser reproduzivel.
- **Isolamento.** Uma VPC dedicada separa o projeto de qualquer outra coisa
  que exista na conta, e o `terraform destroy` remove tudo sem afetar outros
  recursos.
- **Controle do enderecamento.** Escolhemos as faixas de IP de cada camada,
  o que facilita regras de firewall e entender a rede.

---

## 3. Conceitos em uma linha

| Conceito | Em uma linha |
| --- | --- |
| **VPC** | A rede privada do projeto dentro da AWS. |
| **CIDR** | A faixa de enderecos de uma rede, ex.: `10.0.0.0/16`. |
| **Subnet** | Um pedaco da VPC, preso a uma unica AZ. |
| **AZ** | Datacenter isolado dentro da regiao `us-east-1`. |
| **Tabela de rotas** | Diz para onde vai o trafego que sai de uma subnet. |
| **Subnet publica** | Subnet cuja tabela de rotas tem saida pelo Internet Gateway. |
| **Subnet privada** | Subnet sem rota para o Internet Gateway; nada da internet chega nela. |
| **Internet Gateway (IGW)** | A porta da VPC para a internet, nos dois sentidos. |
| **NAT Gateway** | Deixa subnets privadas **sairem** para a internet sem poderem ser **acessadas**. |
| **Elastic IP (EIP)** | IP publico fixo reservado na conta. |
| **Security group (SG)** | Firewall ligado a um recurso (maquina, banco): quem pode entrar e sair, por porta. |
| **Network ACL (NACL)** | Firewall ligado a subnet inteira. |

---

## 4. Mapa de enderecos

### Por que `10.0.0.0/16`

- `10.0.0.0/8` e uma das faixas reservadas para redes privadas (RFC 1918):
  nunca e usada na internet, entao nao conflita com enderecos publicos.
- `/16` da **65.536 enderecos**, o maior tamanho permitido para uma VPC. Sobra
  muito espaco para novas subnets no futuro sem refazer a rede.

### Por que `/24` em cada subnet

- Cada `/24` tem 256 enderecos; a AWS reserva 5 em cada subnet, sobrando
  **251 utilizaveis**.
- No EKS, **cada pod recebe um IP da subnet** (add-on `vpc-cni`). Com 251 IPs
  por subnet privada ha folga para muitos pods mesmo se o cluster crescer.
- `/24` deixa a conta facil de ler: o terceiro numero identifica a subnet.

### Por que esses numeros (0-1, 10-11, 20-21)

| Faixa | Camada | Regra |
| --- | --- | --- |
| `10.0.0.x` e `10.0.1.x` | Publica | dezena 0 |
| `10.0.10.x` e `10.0.11.x` | Privada | dezena 1 |
| `10.0.20.x` e `10.0.21.x` | Banco | dezena 2 |

O ultimo digito indica a AZ (0 = `us-east-1a`, 1 = `us-east-1b`). So de olhar
um IP, como `10.0.11.133`, da para saber: subnet privada, AZ `us-east-1b`.
Os intervalos entre as dezenas ficam livres para crescer (ex.: uma terceira AZ
seria `10.0.2.0/24`, `10.0.12.0/24`, `10.0.22.0/24`).

---

## 5. As tres camadas de subnets

A rede segue o padrao de **tres camadas**: o que precisa ser alcancado pela
internet, o que roda a aplicacao e o que guarda dados. Cada camada so fala com
a vizinha, o que limita o estrago se algo for comprometido.

### 5.1 Subnets publicas - `10.0.0.0/24` e `10.0.1.0/24`

- **O que fica aqui:** o NAT Gateway e os Load Balancers que o Kubernetes cria
  para Services do tipo `LoadBalancer` (manifestos em `/k8s`).
- **Rota:** `0.0.0.0/0` (qualquer destino) -> Internet Gateway.
- **Tag:** `kubernetes.io/role/elb = 1`. E assim que o Kubernetes descobre em
  quais subnets pode criar Load Balancers **publicos**.
- **Por que existem:** algo precisa ter IP publico para receber os usuarios
  (o Load Balancer) e para dar saida aos privados (o NAT). Nada da aplicacao
  roda aqui.
- **IP publico automatico desligado** (`map_public_ip_on_launch = false`):
  mesmo nessas subnets, uma maquina nao recebe IP publico sem pedir.

### 5.2 Subnets privadas - `10.0.10.0/24` e `10.0.11.0/24`

- **O que fica aqui:** os 2 nos do EKS (um em cada subnet) e, portanto, todos
  os pods: API, Jobs `migrator` e `seeder`, `coredns`, `metrics-server`.
  Tambem ficam aqui as interfaces de rede que o EKS usa para o control plane
  conversar com os nos.
- **Rota:** `0.0.0.0/0` -> NAT Gateway.
- **Tag:** `kubernetes.io/role/internal-elb = 1`, para Load Balancers
  **internos** (acessiveis so de dentro da VPC), se algum dia forem usados.
- **Por que existem:** a aplicacao nao deve ser acessivel diretamente pela
  internet. Um atacante nao consegue abrir conexao com um no ou pod; o unico
  caminho de entrada e pelo Load Balancer, que so encaminha para as portas
  configuradas.

### 5.3 Subnets de banco - `10.0.20.0/24` e `10.0.21.0/24`

- **O que fica aqui:** o RDS PostgreSQL (`oficina-fiap-postgres`), hoje na
  primeira; a segunda e reserva.
- **DB subnet group:** o RDS exige um "subnet group" com subnets em **pelo
  menos duas AZs**, mesmo rodando em uma so. Ele permite, no futuro, ligar
  Multi-AZ (copia do banco na outra AZ) ou recriar o banco na outra AZ sem
  mudar a rede.
- **Rota:** o modulo nao cria tabela propria para elas; usam a mesma tabela
  das privadas (`0.0.0.0/0` -> NAT). Ou seja: o banco poderia **sair** para a
  internet (o RDS nao faz isso por conta propria), mas **nada da internet
  chega** nelas.
- **Defesa em camadas:** alem de estarem sem entrada pela internet, o RDS e
  criado com `publicly_accessible = false` e o firewall dele so aceita a porta
  5432 vinda dos nos do cluster (item 10).
- **Por que separar do restante:** o banco guarda os dados de clientes,
  veiculos e ordens de servico. Isolar em subnets proprias deixa claro onde
  estao os dados e permite regras especificas so para elas.

---

## 6. Duas zonas de disponibilidade

Todas as camadas existem em `us-east-1a` **e** `us-east-1b`.

- **Por que:** uma AZ pode ficar indisponivel (falha de energia, rede). Com um
  no em cada AZ, se uma cair, o Kubernetes continua com o outro no e recria os
  pods la. O enunciado pede alta disponibilidade.
- **Exigencias da AWS:** o EKS pede subnets em pelo menos 2 AZs para o
  cluster; o RDS pede o subnet group em pelo menos 2 AZs.
- **Por que nao 3:** cada AZ a mais adiciona subnets e (se houver NAT por AZ)
  custo; com 2 nos, nao ha o que colocar em uma terceira.
- **Validacao no codigo:** a variavel `availability_zones` exige exatamente 2
  itens, porque o layout tem 2 subnets por camada.

---

## 7. Saida e entrada da internet: IGW, NAT e EIP

### Internet Gateway (IGW)

- **O que e:** o ponto de ligacao entre a VPC e a internet. Sem ele, nada na
  VPC fala com fora.
- **Configuracao:** 1 por VPC; usado pela tabela de rotas publica.
- **Custo:** gratuito.

### NAT Gateway

- **O que e:** um "tradutor" que fica na subnet publica. Quando um pod na
  subnet privada acessa a internet, o NAT troca o endereco privado do pod
  pelo IP publico dele e devolve a resposta. Conexoes **iniciadas de fora**
  nao tem como chegar ao pod.
- **Por que e necessario:** os nos e pods ficam em subnets privadas, mas
  precisam sair para:
  - baixar imagens de containers (ECR e registros publicos);
  - falar com a API do EKS e outros servicos AWS;
  - chamar o Stripe (pagamentos) e o servidor SMTP (e-mails);
  - baixar atualizacoes do sistema dos nos.
- **Configuracao:** **um unico NAT** (`single_nat_gateway = true`), na subnet
  publica de `us-east-1a`, servindo as 4 subnets privadas e de banco.
- **Por que um so:** cada NAT custa cerca de US$ 0,045/hora (~US$ 33/mes) mais
  o trafego. Um por AZ dobraria esse custo fixo. Ver o risco no item 12.

### Elastic IP (EIP)

- **O que e:** um IP publico fixo reservado na conta.
- **Por que:** o NAT precisa de um IP publico. Sendo fixo, todo trafego de
  saida do cluster aparece na internet com o **mesmo IP**, o que permite, por
  exemplo, liberar esse IP em um firewall de terceiros.

---

## 8. Tabelas de rotas

Uma tabela de rotas diz, para cada destino, por onde o trafego sai. Toda
tabela tem automaticamente a rota **`local`** (`10.0.0.0/16`): trafego entre
quaisquer subnets da VPC vai direto, sem passar por gateway.

| Tabela | Rotas | Associada a |
| --- | --- | --- |
| Publica | `10.0.0.0/16` -> local; `0.0.0.0/0` -> Internet Gateway | 2 subnets publicas |
| Privada | `10.0.0.0/16` -> local; `0.0.0.0/0` -> NAT Gateway | 2 subnets privadas e 2 de banco |
| Padrao (da VPC) | `10.0.0.0/16` -> local | nenhuma subnet |

- As **6 associacoes** ligam cada subnet a sua tabela. Uma subnet sem
  associacao usaria a tabela padrao.
- **Por que so uma tabela privada:** com um unico NAT, todas as privadas usam
  a mesma saida; uma tabela por AZ so faria sentido com um NAT por AZ.
- **A diferenca entre "publica" e "privada" e exatamente a rota
  `0.0.0.0/0`**: para o Internet Gateway (publica) ou para o NAT (privada).

---

## 9. Itens padrao da VPC

Toda VPC nasce com um security group, uma network ACL e uma tabela de rotas
"padrao". O modulo **adota** os tres (passam a ser controlados pelo
Terraform) para que nada fique com configuracao desconhecida:

| Item | Como fica | Por que |
| --- | --- | --- |
| Security group padrao | **Sem nenhuma regra** (nada entra, nada sai) | Se algum recurso for criado sem escolher um SG, ele cai no padrao; sem regras, fica isolado em vez de exposto. Boa pratica de seguranca. |
| Network ACL padrao | Libera todo trafego de entrada e saida | O controle fino fica nos security groups, que sao mais faceis de manter (guardam estado das conexoes). A NACL fica aberta para nao bloquear respostas por engano. |
| Tabela de rotas padrao | So a rota `local` | Nenhuma subnet usa; se alguma ficar sem associacao, nao ganha acesso a internet por acidente. |

---

## 10. Firewalls: security groups

A VPC define **por onde** o trafego pode passar; os security groups definem
**quem pode falar com quem**, em qual porta. Eles sao criados em `eks.tf`
(pelo modulo EKS) e em `rds.tf`, mas fazem parte da rede.

### 10.1 Security group dos nos (criado pelo modulo EKS)

Ligado aos 2 nos (e, portanto, aos pods).

| Direcao | Porta | Origem/destino | Para que |
| --- | --- | --- | --- |
| Entrada | 443 | Control plane | API do cluster falar com os nos |
| Entrada | 10250 | Control plane | API do cluster falar com o `kubelet` (logs, exec, metricas) |
| Entrada | 10251 e 4443 | Control plane | `metrics-server` (10251 e a porta atual no EKS; 4443 a antiga). Necessario para o HPA. |
| Entrada | 6443, 8443, 9443 | Control plane | Ja liberadas pelo modulo para componentes comuns (prometheus-adapter, Karpenter, AWS Load Balancer Controller/NGINX); hoje nao usadas pelo projeto. |
| Entrada | 53 TCP e UDP | Os proprios nos | DNS interno (`coredns`) |
| Entrada | 1025-65535 | Os proprios nos | Pods conversando entre si em nos diferentes |
| Saida | todas | `0.0.0.0/0` | Sair para a VPC e, via NAT, para a internet |

### 10.2 Security group do cluster (criado pelo modulo EKS)

Ligado as interfaces do control plane do EKS.

| Direcao | Porta | Origem | Para que |
| --- | --- | --- | --- |
| Entrada | 443 | SG dos nos | Os nos (kubelet, pods) falarem com a API do Kubernetes |

Somando 10.1 e 10.2 sao as **12 regras** (`aws_security_group_rule`) do plano.

### 10.3 Security group do RDS (`rds.tf`)

| Direcao | Porta | Origem | Para que |
| --- | --- | --- | --- |
| Entrada | 5432 TCP | **Somente** o SG dos nos | Pods (API, migrator, seeder) acessarem o PostgreSQL |

- **Nao ha regra por faixa de IP**: nem a VPC inteira, nem a internet. Se
  amanha alguem criar outra maquina na VPC, ela nao alcanca o banco, a menos
  que esteja no SG dos nos. O teste `tests/rds.tftest.hcl` garante que a regra
  nao usa CIDR.
- **Sem regra de saida:** o banco so responde conexoes; nao inicia nenhuma.
- **Por que referenciar o SG em vez de IPs:** os nos podem ser trocados (e
  ganhar IPs novos) a qualquer momento; a referencia ao SG continua valida.

---

## 11. Caminhos do trafego

### Usuario acessando a API

```
Usuario -> Internet -> Internet Gateway -> Load Balancer (subnet publica)
        -> pod da API (subnet privada, porta do Service)
```

O Load Balancer e criado pelo Kubernetes a partir de `/k8s` (nao pelo
Terraform), nas subnets com a tag `kubernetes.io/role/elb`.

### API chamando Stripe ou SMTP

```
pod (10.0.10.x) -> tabela privada: 0.0.0.0/0 -> NAT (subnet publica 1a)
                -> Internet Gateway -> Internet (sai com o Elastic IP)
```

A resposta volta pelo mesmo caminho. Conexoes iniciadas de fora nao entram.

### API acessando o banco

```
pod (10.0.10.x / 10.0.11.x) -> rota local -> RDS (10.0.20.x):5432
```

Nao sai da VPC. Liberado pelo SG do RDS (origem = SG dos nos). Conexao cifrada
com TLS (`sslmode=require`).

### Node baixando imagem do ECR

```
no -> NAT -> Internet Gateway -> ECR (endereco publico da AWS)
```

### Desenvolvedor ou pipeline usando `kubectl`

```
kubectl -> Internet -> endpoint publico do EKS (gerenciado pela AWS, fora da VPC)
```

A autenticacao e por IAM (so quem tem access entry entra). Do lado de dentro,
os nos falam com o control plane pelo endpoint privado, sem sair da VPC.

### Algo da internet tentando acessar um no ou o banco

```
Internet -> (nao ha rota de entrada para subnets privadas/banco) -> bloqueado
```

---

## 12. Escolhas, custos e limites

| Escolha | Beneficio | Custo / risco | Alternativa |
| --- | --- | --- | --- |
| 1 NAT Gateway compartilhado | Economiza ~US$ 33/mes por AZ | Se a AZ `us-east-1a` cair, os pods de `us-east-1b` perdem a saida para a internet (Stripe, SMTP, imagens novas). O acesso de usuarios e ao banco continua. | `single_nat_gateway = false` + `one_nat_gateway_per_az = true` (um NAT por AZ) |
| Nos e banco em subnets privadas | Nada exposto diretamente | Precisa do NAT para saida (custo fixo e por GB trafegado) | - |
| Sem VPC endpoints | Menos recursos e custo fixo | Imagens do ECR e chamadas a AWS passam pelo NAT (cobranca por GB) | Endpoints de ECR/S3 para trafego direto a AWS |
| 2 AZs | Tolera a queda de uma AZ | 2 subnets por camada | 3 AZs para mais resiliencia |
| Subnets `/24` | Simples de ler, 251 IPs cada | Limite de IPs por subnet (folgado para este projeto) | Subnets maiores (`/20`) se o cluster crescer muito |
| Subnets de banco sem tabela propria | Menos recursos | Teoricamente teriam saida via NAT (o RDS nao usa) | `create_database_subnet_route_table = true` para isolar totalmente |

Custos fixos da rede (regiao `us-east-1`):

| Recurso | Custo aproximado |
| --- | --- |
| VPC, subnets, tabelas de rotas, IGW, security groups | gratuitos |
| NAT Gateway | ~US$ 0,045/hora + ~US$ 0,045 por GB processado |
| Elastic IP (em uso pelo NAT) | ~US$ 0,005/hora (IPv4 publico) |

---

## 13. Como alterar

As mudancas sao feitas em [`infra/network.tf`](../../infra/network.tf) ou nas
variaveis, sempre com `terraform plan` antes do `apply`.

| Quero... | Onde | Observacao |
| --- | --- | --- |
| Trocar as AZs | `availability_zones` em `terraform.tfvars` | Exatamente 2, da mesma regiao de `aws_region`. Recria subnets: exige destruir o cluster e o banco. |
| Um NAT por AZ | `single_nat_gateway = false` e `one_nat_gateway_per_az = true` no modulo `vpc` | Dobra o custo do NAT; cria uma tabela privada por AZ. |
| Isolar totalmente as subnets de banco | `create_database_subnet_route_table = true` no modulo `vpc` | Cria tabela propria sem rota para a internet. |
| Mudar faixas de IP | listas `*_subnets` e `cidr` no modulo `vpc` | Recria a rede inteira: planejar com o ambiente destruido. |

Mudancas na rede quase sempre recriam recursos que dependem dela (nos,
banco). Leia o `plan` com atencao a linhas `must be replaced`.

---

## 14. Perguntas comuns

**Por que o banco nao tem IP publico, nem que seja para eu acessar do meu
computador?**
Expor o banco a internet e uma das causas mais comuns de vazamento de dados.
Para acessar, use um pod temporario no cluster (comando em
[infra/README.md](../../infra/README.md)).

**Se os nos estao em subnet privada, como o Kubernetes baixa as imagens?**
Pelo NAT Gateway (item 7). Sem NAT, os nos nao conseguiriam nem entrar no
cluster.

**O Load Balancer da API aparece no Terraform?**
Nao. Ele e criado pelo Kubernetes quando um Service do tipo `LoadBalancer` e
aplicado. O Terraform so prepara as subnets com a tag certa. Por isso, antes
do `terraform destroy`, os Services `LoadBalancer` precisam ser removidos; o
Load Balancer ocupa as subnets e impede a exclusao da VPC.

**Por que o NAT fica em `us-east-1a` e nao na outra?**
O modulo coloca o NAT unico na primeira subnet publica da lista, que e a de
`us-east-1a`. Nao ha diferenca pratica entre as duas.

**Os pods recebem IP de onde?**
Da subnet privada do no em que rodam (`10.0.10.x` ou `10.0.11.x`), via add-on
`vpc-cni`. Por isso os pods podem ser referenciados por regras de security
group e alcancam o RDS diretamente.
