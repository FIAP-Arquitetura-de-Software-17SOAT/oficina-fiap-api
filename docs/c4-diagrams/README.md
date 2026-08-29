# Diagramas C4

Modelo C4 da Oficina FIAP API, níveis 1 e 2.

| Nível | Imagem | Fonte | Responde a pergunta |
|---|---|---|---|
| 1 — Contexto | `nivel-1-contexto.png` | página *Diagrama de contexto - OFICINA FIAP API* | Quem usa o sistema e com quais sistemas externos ele conversa |
| 2 — Containers | `nivel-2-containers.png` | página *Diagrama de containers - OFICINA API FIAP* | De quais peças executáveis o sistema é feito e como elas se falam |

As imagens são exportações do `c4-diagram-oficina-fiap.drawio`, que é a fonte:
um XML sem compactação, versionável e diffável. Para editar, abra em
[app.diagrams.net](https://app.diagrams.net) ou no draw.io desktop — as duas
páginas aparecem como abas na parte de baixo. **Ao alterar o diagrama, reexporte
as duas imagens**, senão elas passam a contar uma história diferente da fonte.

## Nível 1 — Contexto

![Diagrama de contexto](nivel-1-contexto.png)

## Nível 2 — Containers

![Diagrama de containers](nivel-2-containers.png)

## O que cada nível mostra

**Nível 1 — Contexto.** Os atores autenticados são o **Atendente** (perfil
`EMPLOYEE`) e o **Administrador** (perfil `ADMIN`), os dois únicos perfis que o
sistema conhece. O **Cliente da oficina** e o **Estoquista** são pessoas externas:
nenhum dos dois acessa a API — recebem e-mail, e o cliente paga pelo checkout do
Stripe. Os sistemas externos são o **Stripe** e o **Servidor SMTP**.

**Nível 2 — Containers.** Os quatro serviços do `docker-compose.yml` aparecem como
containers: **API REST** (NestJS), **Migrate** e **Seed** (efêmeros, rodam a cada
`up`) e o **banco PostgreSQL**. A **Swagger UI** é servida pela própria API em
`/api/v1/docs`.

O mecânico não aparece como ator porque não é usuário do sistema: a OS guarda
apenas o `mechanicId`, e quem registra é o atendente. É a mesma leitura descrita
em [../wiki/linguagem-ubiqua.md](../wiki/linguagem-ubiqua.md).

