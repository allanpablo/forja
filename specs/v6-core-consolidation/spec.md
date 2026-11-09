# Spec: v6-core-consolidation

- **ID**: SPEC-058
- **Status**: draft
- **Owner**: allanpablo
- **Criado em**: 2026-11-05
- **Sprint alvo**: v6.0 Wave 2
- **ADRs relacionadas**: a criar em memory/90-decisions/

## 1. Problema
O núcleo do forja cresceu por acréscimo e hoje há múltiplas implementações para a mesma responsabilidade. Estado validado em 2026-11-05 (v5.2.0):

- **6 leitores independentes** do audit trail `.context/forja-runs.jsonl` (`lib/governance-report.ts`, `lib/status-model.ts`, `lib/audit.ts`, `scripts/memory-schema.ts`, `scripts/risk.ts`, `scripts/audit-sync.ts`) — cada um com seu parsing; um bug de formato precisa ser corrigido 6×.
- **`process.exit(1)` em 32 arquivos** e `cli-output.ts` adotado em apenas **8 de 54 scripts** — saída e códigos de erro inconsistentes entre comandos.
- **`audit()` silencia sem workspace**: `bin/forja.ts` tem `if (!info.exists) return;` — comandos rodados fora de projeto forja não geram trilha (por design atual, mas sem alternativa de log mínimo).
- **`any` em 360 pontos** do código do repo (341 `: any` + 19 `as any`; 0 em `packages/` e `apps/`) — fronteiras internas sem contrato de tipo.
- Dispatch de comandos via processos `node:` separados (99 dos 104 comandos do registry) — overhead de spawn por comando e estado não compartilhado.
- Gates declarados em apenas **39 dos 104 comandos**, sem middleware uniforme de execução.
- `apps/worker` dormente desde 2026-08-01; `specs/clean-arch-boilerplate` ainda "approved" sem implementação — ativos ambíguos no repo.

Quem sente: maintainer (cada mudança toca N pontos), agentes de IA (saída inconsistente), contribuidores (sem contrato claro).

## 2. Proposta de valor
Uma única implementação por responsabilidade no núcleo: módulo de auditoria único, camada de saída/erros uniforme, gates como middleware e dispatch in-process — mudanças de comportamento passam de "editar N arquivos" para "editar 1 módulo", com tipos contratuais nas fronteiras.

## 3. User stories
- **Como** maintainer, **quero** um único módulo `audit` que lê/grava o JSONL, **para que** formato e migrações mudem em um só lugar.
- **Como** agente de IA consumindo saída do forja, **quero** formato e códigos de saída uniformes em todos os comandos, **para que** eu possa parsear sem casos especiais por comando.
- **Como** contribuidor, **quero** gates executados por um middleware do registry, **para que** adicionar gate a um comando seja declarativo, não código novo.
- **Como** usuário, **quero** dispatch in-process dos comandos `node:`, **para que** cada comando tenha menos latência de spawn.

## 4. Critérios de aceite (Definition of Done)
- [ ] AC-1: Módulo único de auditoria (`lib/audit-core.ts` ou equivalente) é a **única** implementação de leitura/escrita do JSONL; os 6 consumidores atuais o utilizam (grep confirma zero parsing direto remanescente).
- [ ] AC-2: Camada uniforme de saída/erros: `cli-output` (ou sucessor) adotado nos 54 scripts; `process.exit(1)` direto eliminado ou restrito ao entrypoint `bin/forja.ts`.
- [ ] AC-3: Gates executados por middleware do dispatch: comando declara gate no registry e o runner aplica (pré/pós), sem código de gate por script; os 39 gates atuais preservados com mesmo comportamento (testes).
- [ ] AC-4: Dispatch in-process para comandos `node:` com fallback a spawn quando o módulo exigir (documentado); latência média por comando medida antes/depois nas evidências.
- [ ] AC-5: Fronteiras dos módulos públicos tipadas: `any` reduzido em ≥ 50% da baseline (360 → ≤ 180), com teto do lint (SPEC-056) acompanhando a redução.
- [ ] AC-6: Destino de `apps/worker` e `specs/clean-arch-boilerplate` decidido e executado (arquivar com status explícito ou reativar) — zero ativos "aprovados/dormentes" sem decisão.

## 5. Escopo
**Dentro**:
- Consolidação de auditoria, saída/erros, gates middleware, dispatch.
- Tipagem das fronteiras (redução de `any`).
- Decisão sobre worker/specs stale.

**Fora**:
- Mudança do formato do JSONL de auditoria (compatibilidade com trilhas existentes é obrigatória; migração só se inevitável, com ADR).
- Consolidação de `packages/` do monorepo além do necessário para o dispatch (pode virar ADR própria).
- Reescrita de comandos `bin:` (4) — continuam via shell.
- Redução de `any` em código gerado por templates de projeto.

## 6. NFRs / restrições
- Compatibilidade: trilhas JSONL antigas continuam legíveis; `forja-runs.jsonl` sem breaking change de schema.
- Performance: dispatch in-process não pode aumentar p95 de comando simples; AC-4 mede.
- Segurança: auditoria continua imutável (append-only); nenhum caminho novo permite edição de trilha.
- Observabilidade: erros uniformes incluem código estável de erro por classe de falha.

## 7. Riscos e mitigação
| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Refatorar 6 leitores + 54 scripts em um PR gigante | A | A | Fatiar: AC-1 primeiro (audit-core), depois AC-2, cada um com testes e merge próprio |
| Dispatch in-process vazar estado entre comandos | M | A | Isolamento por contexto explícito; fallback spawn; testes de concorrência |
| Redução de `any` introduzir regressões de runtime | M | M | Teto decrescente (SPEC-056) + suíte completa multi-OS antes de cada merge |
| Mudar gates quebrar `release:check`/`project:smoke` | B | A | Gates atuais com snapshot de comportamento antes da migração |

## 8. Métricas de sucesso
30 dias após: 1 implementação de auditoria (grep = 0 duplicatas); 100% dos scripts na camada de saída uniforme; `any` ≤ 180; latência média de comando ≤ valor pré-refatoração; zero issues de trilha de auditoria ilegível.

## Evidências e estado real
- Diagnóstico validado em 2026-11-05 contra v5.2.0: 6 leitores JSONL confirmados por grep; `process.exit(1)` em 32 arquivos; `cli-output` em 8/54 scripts; `any`=360 (0 em packages/apps); registry 104 comandos (99 node:, 4 bin:, 1 outro; 39 com gates); `audit()` skip sem workspace em `bin/forja.ts`; worker último commit 2026-08-01; spec clean-arch "approved".
