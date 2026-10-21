# Acronimos da infraestrutura

Lista de todos os acronimos e siglas que aparecem em
[infraestrutura-terraform.md](infraestrutura-terraform.md), em ordem
alfabetica. Para cada um: o nome completo, para que existe e qual problema
resolve, com o uso no projeto quando ajuda a entender.

Indice: [AES](#aes) · [AL2023](#al2023) · [AMI](#ami) · [API](#api) ·
[ARN](#arn) · [AWS](#aws) · [AZ](#az) · [CD](#cd) · [CI](#ci) ·
[CIDR](#cidr) · [CLI](#cli) · [CNI](#cni) · [CPU](#cpu) · [DNS](#dns) ·
[EC2](#ec2) · [ECR](#ecr) · [EKS](#eks) · [ELB](#elb) · [EUA / US](#eua--us) ·
[FIAP](#fiap) · [GB](#gb) · [gp3](#gp3) · [HCL](#hcl) · [HPA](#hpa) ·
[HTTP](#http) · [HTTPS](#https) · [IaC](#iac) · [IAM](#iam) · [ID](#id) ·
[IMDS / IMDSv2](#imds--imdsv2) · [IP](#ip) · [IRSA](#irsa) · [JSON](#json) ·
[K8s](#k8s) · [KMS](#kms) · [NAT](#nat) · [OIDC](#oidc) · [PR](#pr) ·
[RDS](#rds) · [README](#readme) · [S3](#s3) · [SMTP](#smtp) · [SQL](#sql) ·
[SSE](#sse) · [SSL](#ssl) · [SSM](#ssm) · [SSO](#sso) · [STS](#sts) ·
[TCP](#tcp) · [TDD](#tdd) · [TLS](#tls) · [URL](#url) · [vCPU](#vcpu) ·
[VPC](#vpc)

---

### AES

- **Nome completo:** Advanced Encryption Standard (padrao avancado de
  criptografia).
- **Para que existe:** e o algoritmo de criptografia simetrica mais usado no
  mundo; "AES256" indica chave de 256 bits.
- **Problema que resolve:** impede que alguem que tenha acesso ao disco ou ao
  arquivo leia o conteudo. No projeto, criptografa o state do Terraform no S3
  e as imagens no ECR.

### AL2023

- **Nome completo:** Amazon Linux 2023.
- **Para que existe:** distribuicao Linux da propria AWS, mantida e otimizada
  para rodar na AWS.
- **Problema que resolve:** evita ter que escolher, configurar e atualizar um
  sistema operacional por conta propria. A AWS publica versoes ja preparadas
  para EKS; os nos do cluster usam essa imagem.

### AMI

- **Nome completo:** Amazon Machine Image.
- **Para que existe:** e o "molde" de disco (sistema operacional e programas)
  a partir do qual uma maquina EC2 e criada.
- **Problema que resolve:** permite criar varias maquinas identicas sem
  instalar tudo a mao em cada uma. O node group usa a AMI oficial AL2023 do
  EKS.

### API

- **Nome completo:** Application Programming Interface (interface de
  programacao de aplicacoes).
- **Para que existe:** define como um programa conversa com outro (quais
  enderecos, comandos e formatos aceita).
- **Problema que resolve:** permite que sistemas diferentes se integrem sem
  conhecer o codigo interno um do outro. No projeto aparece em dois sentidos:
  a API da oficina (NestJS) e a API do Kubernetes, com a qual o `kubectl`
  conversa.

### ARN

- **Nome completo:** Amazon Resource Name.
- **Para que existe:** identificador unico de qualquer recurso na AWS, no
  formato `arn:aws:<servico>:<regiao>:<conta>:<recurso>`, por exemplo
  `arn:aws:iam::123456789012:user/colega`.
- **Problema que resolve:** nomes como "oficina-api" podem se repetir entre
  contas e regioes; o ARN aponta sem ambiguidade para um recurso especifico.
  E usado em permissoes ("esta role pode acessar ESTE repositorio") e na lista
  de admins do cluster.

### AWS

- **Nome completo:** Amazon Web Services.
- **Para que existe:** a plataforma de computacao em nuvem da Amazon, que
  aluga servidores, bancos, redes e outros servicos sob demanda.
- **Problema que resolve:** elimina a necessidade de comprar e manter
  servidores fisicos; paga-se pelo uso e cria-se ou apaga-se infraestrutura em
  minutos.

### AZ

- **Nome completo:** Availability Zone (zona de disponibilidade).
- **Para que existe:** um ou mais datacenters isolados (energia, rede e
  refrigeracao proprias) dentro de uma regiao da AWS. Ex.: `us-east-1a`.
- **Problema que resolve:** se um datacenter cair, o que esta em outra AZ
  continua funcionando. Por isso o projeto usa duas AZs e coloca um no do
  cluster em cada uma.

### CD

- **Nome completo:** Continuous Delivery / Continuous Deployment (entrega ou
  implantacao continua).
- **Para que existe:** pratica de levar automaticamente cada mudanca aprovada
  ate o ambiente de execucao (build da imagem, publicacao e deploy).
- **Problema que resolve:** evita deploys manuais, demorados e sujeitos a erro.
  No projeto, a pipeline usa a role OIDC para publicar no ECR e aplicar os
  manifestos no EKS.

### CI

- **Nome completo:** Continuous Integration (integracao continua).
- **Para que existe:** pratica de compilar e testar automaticamente o codigo a
  cada push ou pull request.
- **Problema que resolve:** encontra erros cedo, antes de chegarem a branch
  principal. Junto com CD forma o "CI/CD" pedido no enunciado.

### CIDR

- **Nome completo:** Classless Inter-Domain Routing.
- **Para que existe:** notacao para escrever uma faixa de enderecos IP, como
  `10.0.0.0/16`. O numero depois da barra diz quantos bits sao fixos; quanto
  menor, maior a faixa (`/16` = 65.536 enderecos, `/24` = 256).
- **Problema que resolve:** permite dividir uma rede em pedacos de tamanho
  definido sem desperdicar enderecos. A VPC e cada subnet do projeto sao
  definidas por um CIDR.

### CLI

- **Nome completo:** Command Line Interface (interface de linha de comando).
- **Para que existe:** programa usado digitando comandos no terminal, como
  `aws`, `terraform` e `kubectl`.
- **Problema que resolve:** permite automatizar e repetir operacoes (em
  scripts e pipelines), o que nao e possivel clicando em telas. A "AWS CLI" e
  usada para autenticar e configurar o `kubectl`.

### CNI

- **Nome completo:** Container Network Interface.
- **Para que existe:** padrao do Kubernetes para plugins que configuram a rede
  dos containers. O add-on `vpc-cni` e a implementacao da AWS.
- **Problema que resolve:** cada pod precisa de um endereco de rede para
  conversar com outros pods e com servicos como o RDS. O `vpc-cni` da a cada
  pod um IP da propria VPC.

### CPU

- **Nome completo:** Central Processing Unit (unidade central de
  processamento).
- **Para que existe:** o processador, que executa as instrucoes dos
  programas.
- **Problema que resolve:** e o recurso de processamento das maquinas. No
  projeto, o uso de CPU e uma das metricas que o HPA observa para decidir
  quantos pods da API manter.

### DNS

- **Nome completo:** Domain Name System (sistema de nomes de dominio).
- **Para que existe:** traduz nomes (como `oficina-fiap-postgres....rds.amazonaws.com`)
  em enderecos IP.
- **Problema que resolve:** pessoas e programas usam nomes estaveis em vez de
  IPs que podem mudar. No cluster, o add-on `coredns` faz isso para os
  Services internos.

### EC2

- **Nome completo:** Amazon Elastic Compute Cloud.
- **Para que existe:** servico da AWS que fornece maquinas virtuais (chamadas
  instancias), como `t3.small`.
- **Problema que resolve:** oferece servidores sob demanda, sem hardware
  proprio. Os nos do cluster EKS sao instancias EC2.

### ECR

- **Nome completo:** Amazon Elastic Container Registry.
- **Para que existe:** repositorio privado de imagens Docker dentro da AWS.
- **Problema que resolve:** o cluster precisa de um lugar seguro e proximo
  para baixar as imagens da aplicacao. O projeto tem tres repositorios:
  `oficina-api`, `oficina-migrator` e `oficina-seeder`.

### EKS

- **Nome completo:** Amazon Elastic Kubernetes Service.
- **Para que existe:** Kubernetes gerenciado pela AWS: ela opera o "cerebro"
  do cluster (control plane) e voce cuida dos nos e das aplicacoes.
- **Problema que resolve:** instalar, atualizar e manter um control plane de
  Kubernetes altamente disponivel e complexo; o EKS faz isso pelo usuario. E o
  cluster pedido no enunciado.

### ELB

- **Nome completo:** Elastic Load Balancing.
- **Para que existe:** servico da AWS de balanceadores de carga, que recebem o
  trafego e distribuem entre varias maquinas ou pods.
- **Problema que resolve:** um unico endereco publico para a API, mesmo com
  varios pods; se um cair, o trafego vai para os outros. A tag
  `kubernetes.io/role/elb` diz ao Kubernetes em quais subnets criar esses
  balanceadores.

### EUA / US

- **Nome completo:** Estados Unidos da America / United States.
- **Para que existe:** aparece em "Virginia, EUA" (localizacao da regiao
  `us-east-1`) e em "US$" (dolar americano, moeda da cobranca da AWS).
- **Problema que resolve:** nao e um termo tecnico; esta aqui so para o
  documento ficar completo.

### FIAP

- **Nome completo:** Faculdade de Informatica e Administracao Paulista.
- **Para que existe:** instituicao responsavel pela pos-graduacao e pelo Tech
  Challenge; aparece no nome do projeto e da organizacao no GitHub.
- **Problema que resolve:** nao e um termo tecnico; identifica o projeto.

### GB

- **Nome completo:** Gigabyte.
- **Para que existe:** unidade de medida de armazenamento ou memoria (cerca de
  1 bilhao de bytes).
- **Problema que resolve:** dimensionar recursos: o banco tem 20 GB de disco e
  cada no `t3.small` tem 2 GB de memoria.

### gp3

- **Nome completo:** General Purpose SSD, geracao 3 (tipo de volume do Amazon
  EBS, Elastic Block Store, o servico de discos da AWS; SSD = Solid State
  Drive, disco sem partes moveis).
- **Para que existe:** tipo de disco SSD de uso geral da AWS.
- **Problema que resolve:** oferece bom desempenho com custo menor que a
  geracao anterior (gp2), e o desempenho nao depende do tamanho do disco. E o
  disco do RDS.

### HCL

- **Nome completo:** HashiCorp Configuration Language.
- **Para que existe:** a linguagem dos arquivos `.tf` do Terraform, criada pela
  HashiCorp.
- **Problema que resolve:** descrever infraestrutura de forma legivel para
  pessoas e, ao mesmo tempo, precisa para a maquina, com variaveis,
  referencias entre recursos e expressoes.

### HPA

- **Nome completo:** Horizontal Pod Autoscaler.
- **Para que existe:** recurso do Kubernetes que aumenta ou diminui a
  quantidade de pods de uma aplicacao conforme o uso de CPU ou memoria.
- **Problema que resolve:** atender picos de demanda (muitas ordens de servico
  ao mesmo tempo) sem deixar recursos sobrando fora do pico. Depende do
  `metrics-server`, instalado pelo Terraform.

### HTTP

- **Nome completo:** Hypertext Transfer Protocol.
- **Para que existe:** protocolo de comunicacao da web e das APIs REST.
- **Problema que resolve:** padroniza como clientes pedem e servidores
  respondem. Sozinho nao e criptografado; por isso a policy do bucket do state
  recusa acesso sem TLS.

### HTTPS

- **Nome completo:** Hypertext Transfer Protocol Secure.
- **Para que existe:** HTTP protegido por TLS.
- **Problema que resolve:** impede que alguem no caminho da rede leia ou altere
  os dados (senhas, tokens, o state com a senha do banco).

### IaC

- **Nome completo:** Infrastructure as Code (Infraestrutura como Codigo).
- **Para que existe:** pratica de descrever servidores, redes e bancos em
  arquivos de codigo, versionados no git, em vez de configura-los a mao.
- **Problema que resolve:** ambientes criados a mao sao dificeis de repetir,
  revisar e documentar. Com IaC, qualquer pessoa recria o mesmo ambiente com
  os mesmos comandos. O Terraform e a ferramenta de IaC do projeto.

### IAM

- **Nome completo:** AWS Identity and Access Management.
- **Para que existe:** servico que controla quem (usuarios, roles, servicos)
  pode fazer o que em quais recursos da AWS.
- **Problema que resolve:** sem ele, qualquer credencial poderia fazer tudo. O
  projeto cria roles com o minimo necessario: a dos nos so baixa imagens e
  configura a rede; a do GitHub so publica nos 3 repositorios e faz deploy no
  cluster.

### ID

- **Nome completo:** Identifier (identificador).
- **Para que existe:** codigo unico que a AWS da a cada recurso criado (ex.:
  `vpc-0abc...`, `lt-078...`).
- **Problema que resolve:** permite ao Terraform saber exatamente qual recurso
  real corresponde a cada bloco do codigo; esses IDs ficam guardados no state.

### IMDS / IMDSv2

- **Nome completo:** Instance Metadata Service (servico de metadados da
  instancia), versao 2.
- **Para que existe:** endereco interno que cada maquina EC2 consulta para
  saber informacoes sobre si mesma, inclusive credenciais temporarias da sua
  role IAM.
- **Problema que resolve:** a versao 1 podia ser abusada para roubar essas
  credenciais (por exemplo, por um pod comprometido). A versao 2 exige um token
  de sessao; o projeto obriga IMDSv2 e limita o acesso a propria maquina.

### IP

- **Nome completo:** Internet Protocol.
- **Para que existe:** protocolo que da enderecos (como `10.0.10.70`) a
  maquinas e pods e leva os pacotes entre eles.
- **Problema que resolve:** sem endereco, nao ha como um computador encontrar
  outro na rede. O NAT usa um IP publico fixo (Elastic IP); os pods recebem IPs
  privados da VPC.

### IRSA

- **Nome completo:** IAM Roles for Service Accounts.
- **Para que existe:** mecanismo do EKS que associa uma role IAM a uma conta
  de servico do Kubernetes, para que um pod especifico tenha permissoes AWS
  proprias.
- **Problema que resolve:** sem ele, todos os pods de um no compartilham as
  permissoes da maquina. O modulo deixa o provedor OIDC do cluster criado para
  uso futuro.

### JSON

- **Nome completo:** JavaScript Object Notation.
- **Para que existe:** formato de texto para dados estruturados
  (`{"chave": "valor"}`).
- **Problema que resolve:** formato universal entre sistemas. As politicas IAM
  e a regra de lifecycle do ECR sao escritas em JSON, e `terraform output -json`
  devolve os outputs nesse formato.

### K8s

- **Nome completo:** Kubernetes (o "8" substitui as 8 letras entre o "K" e o
  "s").
- **Para que existe:** plataforma que executa e gerencia containers em varias
  maquinas: decide onde cada pod roda, reinicia os que falham e escala.
- **Problema que resolve:** rodar muitos containers a mao, em muitas maquinas,
  com alta disponibilidade, e inviavel. Os manifestos em `/k8s` sao aplicados
  no cluster criado pelo Terraform.

### KMS

- **Nome completo:** AWS Key Management Service.
- **Para que existe:** servico que cria e guarda chaves de criptografia e
  controla quem pode usa-las.
- **Problema que resolve:** guardar chaves de criptografia com seguranca e
  dificil; o KMS cuida disso e registra cada uso. No projeto, uma chave KMS
  criptografa os Secrets do Kubernetes (ex.: a `DATABASE_URL`).

### NAT

- **Nome completo:** Network Address Translation (traducao de enderecos de
  rede).
- **Para que existe:** troca o endereco privado de uma maquina por um endereco
  publico quando ela acessa a internet. O NAT Gateway e o servico da AWS que
  faz isso.
- **Problema que resolve:** os nos ficam em subnets privadas (inacessiveis de
  fora, mais seguro), mas precisam sair para baixar imagens e chamar Stripe e
  SMTP. O NAT permite a saida sem permitir a entrada.

### OIDC

- **Nome completo:** OpenID Connect.
- **Para que existe:** padrao de autenticacao em que um provedor de identidade
  emite um token assinado provando quem e o usuario ou o sistema.
- **Problema que resolve:** dispensa senhas e chaves fixas. O GitHub Actions
  recebe um token OIDC a cada execucao e a AWS o troca por credenciais
  temporarias, sem guardar chaves da AWS no GitHub (que poderiam vazar).

### PR

- **Nome completo:** Pull Request.
- **Para que existe:** pedido, no GitHub, para juntar as mudancas de uma branch
  em outra, com revisao e discussao.
- **Problema que resolve:** garante que o codigo seja revisado antes de chegar
  a branch principal. O Terraform do projeto entrou pelo PR #71.

### RDS

- **Nome completo:** Amazon Relational Database Service.
- **Para que existe:** banco de dados relacional gerenciado pela AWS
  (PostgreSQL, MySQL e outros).
- **Problema que resolve:** instalar, fazer backup, aplicar atualizacoes e
  monitorar um banco da trabalho e exige conhecimento especifico; o RDS faz
  isso. E o banco PostgreSQL 16 da API.

### README

- **Nome completo:** "read me" (leia-me).
- **Para que existe:** arquivo de documentacao principal de um projeto ou
  pasta, exibido automaticamente pelo GitHub.
- **Problema que resolve:** e o primeiro lugar onde alguem procura como usar o
  projeto. `infra/README.md` traz a referencia rapida do Terraform.

### S3

- **Nome completo:** Amazon Simple Storage Service.
- **Para que existe:** armazenamento de arquivos (objetos) em "buckets", com
  alta durabilidade.
- **Problema que resolve:** guardar arquivos de forma segura e acessivel por
  varias pessoas e maquinas. O state do Terraform fica em um bucket S3, para
  todo o grupo e a pipeline usarem o mesmo.

### SMTP

- **Nome completo:** Simple Mail Transfer Protocol.
- **Para que existe:** protocolo de envio de e-mails.
- **Problema que resolve:** padroniza como um sistema entrega e-mails a um
  servidor de correio. A API usa SMTP para notificar o status das ordens de
  servico; por isso os nos precisam de saida para a internet (NAT).

### SQL

- **Nome completo:** Structured Query Language.
- **Para que existe:** linguagem para consultar e alterar bancos relacionais;
  aparece no nome "PostgreSQL" e nos arquivos `migration.sql`.
- **Problema que resolve:** forma padrao de criar tabelas e ler ou gravar
  dados. As migrations do Prisma sao arquivos SQL aplicados pelo Job
  `migrator`.

### SSE

- **Nome completo:** Server-Side Encryption (criptografia no lado do
  servidor).
- **Para que existe:** o proprio servico criptografa os dados ao gravar e
  descriptografa ao ler. "SSE-S3" usa chaves gerenciadas pelo S3.
- **Problema que resolve:** protege os dados em repouso sem que a aplicacao
  precise implementar criptografia. Ativado no bucket do state.

### SSL

- **Nome completo:** Secure Sockets Layer.
- **Para que existe:** antecessor do TLS; o nome continua em parametros e
  colunas como `sslmode` e `ssl=true`, mesmo quando o protocolo usado e TLS.
- **Problema que resolve:** o mesmo do TLS. Ver [TLS](#tls).

### SSM

- **Nome completo:** AWS Systems Manager.
- **Para que existe:** conjunto de ferramentas de operacao da AWS; inclui o
  Parameter Store, onde a AWS publica, por exemplo, a versao mais recente das
  AMIs do EKS.
- **Problema que resolve:** permite descobrir automaticamente a imagem
  atualizada dos nos, sem fixar uma versao a mao no codigo.

### SSO

- **Nome completo:** Single Sign-On (login unico).
- **Para que existe:** um unico login dando acesso a varios sistemas ou contas.
  Na AWS, o "IAM Identity Center" oferece isso.
- **Problema que resolve:** evita uma senha por sistema. No projeto e citado
  porque quem entra via SSO recebe uma sessao temporaria cujo ARN difere do
  ARN da role; o data source `aws_iam_session_context` resolve essa diferenca.

### STS

- **Nome completo:** AWS Security Token Service.
- **Para que existe:** servico que emite credenciais temporarias da AWS.
- **Problema que resolve:** permite que alguem assuma uma role por tempo
  limitado, sem chave permanente. A pipeline chama
  `sts:AssumeRoleWithWebIdentity` com o token OIDC do GitHub; `sts.amazonaws.com`
  e o "publico" (audience) exigido na politica de confianca.

### TCP

- **Nome completo:** Transmission Control Protocol.
- **Para que existe:** protocolo que entrega dados de forma confiavel e em
  ordem entre dois programas, usando portas (ex.: 5432 do PostgreSQL).
- **Problema que resolve:** garante que nada se perca ou chegue embaralhado. A
  regra do security group do RDS libera exatamente "TCP porta 5432" vindo dos
  nos do cluster.

### TDD

- **Nome completo:** Test-Driven Development (desenvolvimento guiado por
  testes).
- **Para que existe:** metodo em que primeiro se escreve um teste que falha,
  depois o codigo minimo para ele passar.
- **Problema que resolve:** garante que cada comportamento tem um teste e que
  o teste realmente detecta o erro. Os testes em `infra/tests/` foram escritos
  assim.

### TLS

- **Nome completo:** Transport Layer Security.
- **Para que existe:** protocolo que criptografa e protege a integridade de
  uma conexao de rede (o "S" do HTTPS).
- **Problema que resolve:** impede que alguem na rede leia ou altere os dados
  em transito. O RDS exige TLS (`rds.force_ssl = 1`), e a `DATABASE_URL` usa
  `sslmode=require`.

### URL

- **Nome completo:** Uniform Resource Locator.
- **Para que existe:** endereco que diz onde e como acessar um recurso, como
  `https://...` ou `postgresql://usuario:senha@host:5432/banco`.
- **Problema que resolve:** reune em uma unica linha tudo o que e preciso para
  conectar. A `DATABASE_URL` entrega a API e ao migrator o endereco, o
  usuario, a senha e as opcoes do banco.

### vCPU

- **Nome completo:** Virtual Central Processing Unit (CPU virtual).
- **Para que existe:** unidade de processamento de uma maquina virtual; um
  `t3.small` tem 2 vCPUs.
- **Problema que resolve:** permite dimensionar e cobrar processamento por
  maquina. A AWS limita quantas vCPUs uma conta pode usar (quota); na conta do
  grupo sao 5, o que limitou o cluster a 2 nos.

### VPC

- **Nome completo:** Virtual Private Cloud (nuvem privada virtual).
- **Para que existe:** rede privada e isolada dentro da AWS, onde ficam as
  maquinas, o banco e os balanceadores.
- **Problema que resolve:** separa os recursos do projeto do resto da internet
  e de outras contas, e permite controlar o que e publico e o que e privado.
  No projeto: `oficina-fiap-vpc`, `10.0.0.0/16`.

---

## Termos que parecem acronimos, mas nao sao

| Termo | O que e |
| --- | --- |
| `t3`, `t4g` | Familias de instancias EC2. O numero e a geracao; o `g` indica processador Graviton, da propria AWS, de arquitetura ARM (Advanced RISC Machines), diferente da x86 dos processadores Intel/AMD. |
| `small`, `micro`, `medium` | Tamanhos dentro da familia (mais memoria e CPU conforme cresce). |
| `db.t4g.micro` | Classe de instancia do RDS: o prefixo `db.` indica banco de dados. |
| `us-east-1` | Codigo da regiao AWS do norte da Virginia (EUA). |
| DynamoDB, CloudTrail, CloudWatch | Nomes de servicos da AWS (banco NoSQL; registro de auditoria das chamadas a AWS; logs e metricas). |
