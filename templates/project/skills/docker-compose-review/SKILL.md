---
name: docker-compose-review
description: Use quando escrever ou revisar arquivos do Docker Compose e Dockerfiles: verifica healthchecks e ordem de inicialização, redes e portas expostas, volumes, segredos, limites de recursos, higiene das imagens e paridade entre desenvolvimento e produção.
---

# Revisão de Docker Compose

Arquivos Compose costumam começar como conveniência do desenvolvedor e, sem alarde, viram o mais próximo que existe de uma especificação de produção. A revisão verifica se os serviços sobem na ordem certa, expõem só o que devem, guardam os dados onde é seu lugar e se comportam em desenvolvimento como vão se comportar em produção.

A saída padrão é uma **tabela de achados e uma matriz de paridade**. Edite arquivos só quando o usuário pedir.

## Convenções

- Escopo: `compose.yaml` / `docker-compose*.yml`, arquivos de override, os Dockerfiles que eles constroem, `.env.example`, e o que descreve a produção (manifests Kubernetes, um compose de produção, a documentação de deploy).
- Sintaxe da Compose Specification (sem `version:` no topo).
- Todo achado cita `arquivo:linha` e um motivo.
- Configuração de produção desconhecida vai para **Perguntas em aberto**; sem ela, a paridade não pode ser avaliada.

## Checklist

**Inicialização e saúde**
- Cada serviço de longa duração tem um `healthcheck` que testa a prontidão (por exemplo, `pg_isready`, um `/healthz` HTTP), com `interval`, `timeout`, `retries` e `start_period`.
- `depends_on` usa `condition: service_healthy` (ou `service_completed_successfully` para jobs de migração). `depends_on` simples só ordena a subida, não espera.
- As migrações rodam como um serviço ou passo de execução única, não dentro do entrypoint da aplicação em toda réplica.
- A aplicação continua tentando reconectar: healthchecks não substituem resiliência.
- Política de `restart:` declarada.

**Redes e portas**
- Só os pontos de entrada publicam portas. Bancos e caches ficam em redes internas.
- Portas publicadas ligadas a `127.0.0.1` em desenvolvimento quando a exposição não é necessária.
- Redes separadas quando grupos de serviços não devem se falar.

**Volumes e dados**
- Volumes nomeados para dados (bancos); bind mounts só para código-fonte em desenvolvimento.
- Nenhum dado gravado na camada do container.
- Scripts de inicialização e dados de seed são idempotentes.

**Configuração e segredos**
- Configuração por ambiente, com `.env.example` documentando cada variável. O `.env` real fica fora do git.
- Segredos via `secrets:` ou o cofre de segredos da plataforma, nunca embutidos em imagens, `ARG`s ou arquivos versionados.
- Nada de credenciais de produção em arquivos de desenvolvimento.

**Imagens**
- Imagens base fixadas numa versão (e num digest em produção). Nada de `latest`.
- Builds multi-stage; imagem final mínima (distroless ou slim); para Node, só o build gerado e as dependências de produção (`npm ci --omit=dev`), nunca o toolchain de desenvolvimento nem source maps que você não distribui.
- Roda como um `USER` não root. Sistema de arquivos raiz somente leitura onde for possível.
- `.dockerignore` exclui `.git`, arquivos de ambiente locais e saídas de build.
- Ordem das camadas maximiza o cache: `package.json` + lockfile e o passo de instalação antes do código-fonte.

**Recursos**
- Limites de memória e CPU nos serviços que podem disparar. Rotação de logs configurada no driver de log.

## Paridade dev/prod

A mesma imagem (construída uma vez) roda em todo lugar; só a configuração muda. Os acréscimos de desenvolvimento (hot reload, depuradores, bind mounts, painéis de administração) ficam em `compose.override.yaml` ou em profiles, não no arquivo base. Os serviços de apoio usam a mesma versão principal da produção (Postgres 16 localmente se a produção roda 16).

## Formato

```
## Achados
| # | Arquivo:linha | Categoria | Severidade | Problema | Correção |
|---|---|---|---|---|---|

## Matriz de paridade
| Serviço | Dev (imagem/versão, config) | Prod | Diferença | Risco |

## Perguntas em aberto
```

Severidade: Bloqueador (exposição de segredo, perda de dados, falha só em produção) · Maior · Menor · Detalhe.

## Próximo

- `ci-pipeline-review` quando o CI constrói essas imagens ou sobe o stack.
- `release-checklist` para diferenças de configuração e versão antes de um deploy.
- `threat-modeling` para serviços expostos.

## Evite

- Tags `latest`.
- Publicar portas de banco em `0.0.0.0`.
- Segredos em `environment:` versionados no repositório.
- `sleep` em entrypoints para esperar dependências.
- Rodar como root por padrão.
- Um stack de desenvolvimento em versões principais diferentes da produção.
