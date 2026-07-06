# ADR-0017: Codegraph como gate de primeira classe no harness GSD

- **Status**: accepted
- **Data**: 2026-06-27
- **Autor(es)**: framework-team
- **Tags**: orchestration, sdd, gsd, codegraph, code-intelligence

## Contexto
O codegraph (grafo de conhecimento SQLite de símbolos/edges, exposto via MCP) já estava instalado e configurado em `.mcp.json`, com scripts `code:index/sync/status/query`. Mas era uma integração **pendurada**: nenhum dos 10 gates do runbook GSD o mencionava, nenhum papel o usava, e o índice apontava para o worktree pai (`2-Projeto-Agents`) em vez de `projects/forja`, retornando símbolos da árvore errada sem erro visível.

Resultado prático: o Worker recebia "implemente `tasks.md`" sem nunca consultar o blast radius de um símbolo antes de editar. O `plan.md` listava "módulos afetados" por inspeção manual em vez de pelos chamadores reais. Governança não tinha como saber se o índice era confiável.

## Decisão
Tornar o codegraph um **passo verificável do fluxo GSD**, com degradação graciosa:

1. **Comando `code:impact <símbolo>`** em `agent-harness.mjs`: retorna chamadores + arquivos afetados consultando o codegraph. É a ferramenta que o Architect/Worker roda antes de planejar/editar.
2. **Comando `code:check`**: valida que o índice existe, pertence a este worktree e não está defasado (heurística por mtime + warning de worktree do próprio `codegraph status`).
3. **Novo gate no runbook GSD**: "Mapa de impacto (codegraph)" entre Contexto e Plano.
4. **`gsd:check` ganha o gate de freshness**: não-bloqueante se o binário codegraph não existe; bloqueante se o índice pertence a outro worktree.

Princípio: nenhum comando novo quebra o fluxo quando codegraph está ausente — avisa e segue. Code intelligence é alavanca, não obstáculo.

## Alternativas consideradas
- **Manter codegraph só como MCP, sem gate** — rejeitada porque uma ferramenta sem gate nem papel que a invoque é ignorada na prática (era o estado atual).
- **Construir índice de código próprio** — rejeitada: reinventa o codegraph, que já entrega grafo com WAL e watcher.
- **Bloquear sempre que o índice estiver "defasado"** — rejeitada: gera falso bloqueio; usamos heurística leve (mtime + worktree) em vez de hash por arquivo.

## Consequências
**Positivas**:
- Architect/Worker editam com blast radius à vista, em menos tokens que reler arquivos
- Governança ganha sinal objetivo de confiabilidade do índice
- O grafo deixa de ser decoração e entra no runbook

**Negativas / Trade-offs**:
- Acoplamento leve à CLI do codegraph (mitigado: só `init/status/sync` + MCP, parsing tolerante)
- Mais um gate no runbook (mitigado: não-bloqueante quando a ferramenta falta)

## Rastreamento
- Implementação: `scripts/agent-harness.mjs`, `package.json`, `specs/harness-codegraph/`
- ADRs relacionadas: ADR-0003 (smart-context), ADR-0005 (handoff 7 campos), ADR-0018 (ferramentas de processo)
