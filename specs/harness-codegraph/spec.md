# Spec: harness-codegraph

- **ID**: SPEC-024
- **Status**: done
- **Owner**: framework-team
- **Criado em**: 2026-06-27
- **Sprint alvo**: harness-2026-06
- **ADRs relacionadas**: ADR-0017 (codegraph no harness GSD), ADR-0018 (ferramentas de processo)

## 1. Problema
O harness GSD/Hermes está sólido (10 gates, handoffs de 7 campos), mas três furos impedem que ele seja a base confiável dos próximos projetos:

1. **Codegraph é uma integração pendurada.** Está instalado (`~/.local/bin/codegraph`), com MCP em `.mcp.json` e scripts `code:*`, mas **nenhum gate do GSD e nenhum papel o usa**. O Worker recebe "implemente `tasks.md`" sem nunca consultar o blast radius de um símbolo antes de editar.
2. **O índice codegraph apontava para o worktree errado** (`2-Projeto-Agents` pai em vez de `projects/forja`), retornando símbolos da árvore errada — silenciosamente.
3. **O gerador (`bin/init-project.js` + `lib/generators/`) não emite nada disso.** Projetos novos não herdam `.mcp.json`, scripts `code:*`, o `agent-harness.mjs` nem os gates GSD. A estrutura morre no framework-raiz.

Mede-se hoje a dor pela ausência: zero consultas codegraph nos handoffs registrados, zero gates de código, e `codegraph status` emitindo warning de worktree.

## 2. Proposta de valor
O codegraph vira **passo verificável do fluxo GSD** (mapa de impacto antes de implementar, freshness no gate de governança), e todo projeto gerado herda o harness completo — codegraph, `code:*`, GSD e ferramentas de processo — sem configuração manual.

## 3. User stories
- **Como** SDD Architect, **quero** rodar `code:impact <símbolo>` para ver chamadores e blast radius, **para que** o `plan.md` liste módulos afetados com evidência, não chute
- **Como** Worker, **quero** que o runbook GSD me obrigue a mapear impacto antes de editar, **para que** eu não quebre chamadores fora do escopo
- **Como** Governance, **quero** que `gsd:check` falhe se o índice codegraph estiver no worktree errado ou defasado, **para que** consultas de código sejam confiáveis no review
- **Como** usuário gerando projeto novo, **quero** que `init-project` já entregue `.mcp.json` + `code:*` + GSD, **para que** o novo projeto nasça com o harness completo
- **Como** Governance, **quero** um `tools:doctor` que detecta ferramentas de processo (codegraph, gitleaks, ast-grep, lefthook), **para que** eu saiba o que está disponível antes de exigir um gate

## 4. Critérios de aceite (Definition of Done)
- [x] AC-1: `npm run code:check` valida que o índice codegraph existe, pertence a este worktree e não está defasado; exit≠0 caso contrário
- [x] AC-2: `npm run code:impact <símbolo>` retorna chamadores + arquivos afetados (via codegraph), com fallback claro se o binário não existir
- [x] AC-3: o runbook gerado por `gsd:plan` inclui um gate "Mapa de impacto (codegraph)" entre Contexto e Plano
- [x] AC-4: `gsd:check` inclui um gate de freshness/worktree do codegraph (não-bloqueante se codegraph ausente, bloqueante se índice for de outro worktree)
- [x] AC-5: `init-project` emite no projeto gerado: `.mcp.json` (codegraph), scripts `code:*` e `gsd:*` no `package.json`, e `scripts/agent-harness.mjs`
- [x] AC-6: `npm run tools:doctor` lista status (instalado/ausente) de codegraph, gitleaks, ast-grep, lefthook, markdownlint
- [x] AC-7: sub-agents `sdd-architect` e `governance` (+ prompts) instruem uso de codegraph; docs (`AGENTS.md`, `agent-harnesses.md`, `gsd-harness.md`, manual) atualizadas
- [x] AC-8: `npm test` cobre `code:check`/`code:impact`/`tools:doctor` com degradação graciosa quando binários ausentes

## 5. Escopo
**Dentro**:
- `scripts/agent-harness.mjs`: comandos `code:impact`, `code:check`
- `scripts/tools-doctor.mjs`: doctor de ferramentas de processo
- `package.json`: scripts `code:impact`, `code:check`, `tools:doctor`
- Template do runbook GSD + lógica do `gsd:check`
- `bin/init-project.js` / `lib/generators/`: emissão do harness no projeto gerado
- `.claude/agents/` + `prompts/` (sdd-architect, governance)
- Docs: `AGENTS.md`, `docs/agent-harnesses.md`, `memory/50-orchestration/gsd-harness.md`, manual
- ADR-0017 e ADR-0018

**Fora** (explícito, evita scope creep):
- Reescrever o codegraph ou criar índice próprio (usamos o binário externo)
- Instalar automaticamente gitleaks/ast-grep/lefthook (apenas detectar + documentar)
- Tornar design:check obrigatório em fluxo CLI-only (mantém ADR vigente)
- Mexer em `projects/` (apps reais, off-limits)

## 6. NFRs / restrições
- Degradação graciosa: nenhum comando novo pode quebrar o fluxo quando codegraph/ferramentas externas não estão instaladas — deve avisar e seguir
- Determinístico: `code:check`/`tools:doctor` não dependem de rede
- Compatibilidade: não quebra `init-project.js` para quem não usa codegraph; `.mcp.json` é aditivo
- pt-BR em toda saída de CLI

## 7. Riscos e mitigação
| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| codegraph ausente no ambiente do usuário | M | M | `code:*` degrada com aviso; gate não-bloqueante quando binário falta |
| Falso bloqueio por índice "defasado" | M | A | Heurística por mtime + warning de worktree do próprio codegraph, nunca por hash de cada arquivo |
| Gerador inchar projetos que não querem codegraph | B | M | `.mcp.json` e gates são aditivos e documentados como opcionais |
| Acoplar harness a versão específica do codegraph CLI | M | M | Usar só `init/status/sync` + MCP; parsear saída de forma tolerante |

## 8. Métricas de sucesso
30 dias após o release: (a) 100% dos projetos novos gerados saem com `.mcp.json` + `code:*` + GSD; (b) `gsd:check` passando inclui o gate codegraph; (c) pelo menos os papéis Architect/Worker referenciam `code:impact` nos handoffs de implementação registrados no SQLite.
