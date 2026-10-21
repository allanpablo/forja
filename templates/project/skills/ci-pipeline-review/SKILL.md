---
name: ci-pipeline-review
description: Use quando escrever ou revisar workflows do GitHub Actions: verifica gatilhos, concorrência, cache, matriz, gates de qualidade, segredos e permissões, fixação de actions, timeouts e custo, e reporta os achados ordenados por severidade.
---

# Revisão de Pipeline de CI

Um pipeline é um gate. Ele precisa barrar código quebrado ou inseguro de forma confiável, rápido o bastante para as pessoas não o contornarem, e sem virar um caminho de ataque para o repositório ou a nuvem.

A saída padrão é uma **tabela de achados**. Edite arquivos de workflow só quando o usuário pedir.

## Convenções

- Escopo: `.github/workflows/*.yml`, actions compostas em `.github/actions/` e as configurações do repositório que o usuário puder compartilhar (proteção de branch, checks obrigatórios, ambientes).
- Entradas: os comandos que o projeto de fato usa (scripts do package.json, Makefile) e a divisão de testes de `testing` (suíte rápida vs. integração).
- A estrutura existente prevalece, a menos que cause um achado.
- Todo achado cita `arquivo:linha` e um motivo.

## Checklist

**Gatilhos e concorrência**
- `pull_request` para os checks; `push` no branch padrão para builds e deploys. Filtros de caminho só quando não puderem pular checks obrigatórios.
- `concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }` em workflows de PR; nunca cancele deploys no meio.
- Gatilhos agendados e manuais (`workflow_dispatch`) têm um propósito.

**Velocidade e cache**
- Cache de dependências pela chave dos lockfiles (`actions/setup-node` com `cache: npm|pnpm|yarn`, instalação com `npm ci` / `pnpm install --frozen-lockfile`).
- Cache de build/teste onde a ferramenta suporta. Cache de camadas Docker (`cache-from`/`cache-to: type=gha`).
- Jobs independentes rodam em paralelo; `needs:` só para dependências reais.
- Matriz só onde compensa (versões de Node do `engines`, ou sistemas operacionais que o projeto de fato distribui). `fail-fast` declarado de propósito.
- `timeout-minutes` em todo job.

**Gates**
- Ordem: formatação/lint → checagem de tipos (`tsc --noEmit`) → testes unitários → build → testes de integração → deploy.
- Os mesmos comandos que os desenvolvedores rodam localmente (`npm test`), não um script separado que se desvia.
- Os status checks obrigatórios no branch padrão batem com os nomes dos jobs. Um job renomeado derruba seu gate em silêncio.
- Deploys passam por `environment:` com regras de proteção; produção exige aprovação ou uma tag de release.

**Segurança**
- `permissions: contents: read` no topo; amplie por job só o necessário.
- OIDC (`id-token: write`) para provedores de nuvem em vez de chaves de longa duração nos segredos.
- `pull_request_target` e `workflow_run` nunca fazem checkout e rodam código não confiável de PR com segredos.
- Nada de `${{ github.event.* }}` interpolado direto em scripts `run:` (injeção de script). Passe por `env:`.
- Actions de terceiros fixadas num SHA de commit completo, com a versão num comentário. Dependabot ou Renovate as atualizam.
- Segredos nunca impressos; valores mascarados não transformados em não mascarados.

**Confiabilidade e custo**
- Testes instáveis em quarentena com uma issue, não repetidos em silêncio.
- Artefatos com `retention-days`; nada de artefatos grandes em todo PR.
- Tamanho do runner adequado ao job.

## Severidade

Bloqueador (brecha de segurança, gate que não barra) · Maior (lento ou instável o bastante para ser contornado, timeout ausente) · Menor (custo, clareza) · Detalhe.

## Formato

```
## Resumo
<forma do pipeline, duração total se conhecida, quantidade de bloqueadores>

## Achados
| # | Arquivo:linha | Categoria | Severidade | Problema | Correção |
|---|---|---|---|---|---|

## Mudanças sugeridas
<trechos de YAML, só a pedido>
```

## Próximo

- `commit-message`: commits `ci:` para as correções.
- `release-checklist` depende de os gates serem reais.
- `docker-compose-review` quando o CI constrói ou executa containers.

## Evite

- Actions fixadas em `@main` ou numa tag mutável.
- `permissions: write-all` ou nenhum bloco `permissions`.
- `continue-on-error: true` em passos obrigatórios.
- Scripts só de CI que divergem dos comandos locais.
- Recomendar uma matriz "por completude".
- Reescrever o pipeline inteiro quando alguns achados resolvem.
