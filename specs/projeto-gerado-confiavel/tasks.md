# Tasks: projeto-gerado-confiavel

- **Spec**: ./spec.md
- **Plan**: ./plan.md
- **Status**: approved
- **Criado em**: 2026-09-08

> Decomposição executável. Cada task tem dono, critério de done e paths.

Grafo de dependência:

```
T1 ─┬─ T2 ─┬─ T3 ─ T7 ─┐
    └── T4 ─┘           │
T3,T4 ─────► T6         │
T4,T6 ─────► T8         │
todas ─────────────────► T9
```

Ordem: T1 (gera via init-project) → T2 (checks existentes adaptam) + T4 (CLI) →
T3 (check novo) → T6 (CI) / T7 (testes) / T8 (docs) → T9.

---

## T1 — `runProjectSmoke({ ai })` gera via `init-project.ts`
- **Owner**: Worker · **Est**: M · **Depende de**: —
- **Paths**: `lib/core/project-smoke.ts`
- **Escopo**: `SmokeEnv.ai?: readonly string[]`. `withGeneratedProject` recebe `ai` e, quando
  presente, `spawn(process.execPath, [resolveScript(root,'bin/init-project'), projectDir, '--ai',
  ai.join(','), '--skip-backend', '--force'], { cwd: dir, env: { ...env, HOME: dir } })` em vez
  de `create-memory-nest-kit`. `runProjectSmoke({ full?, ai?, env? })` propaga `ai` para o env
  dos checks e para `withGeneratedProject`. **Validar**: `init-project.ts --skip-backend` não
  puxa rede nem escreve fora de `dir` (rodar 1× e inspecionar); se puxar, aplicar o kill-criterion.
- **Done**:
  - [ ] `runProjectSmoke()` (sem `ai`) idêntico ao de hoje
  - [ ] `runProjectSmoke({ ai: ['claude'] })` gera um projeto com `AGENTS.md` + `.ia-instructions/claude.md`
  - [ ] nenhum arquivo criado fora do tmp; sem acesso de rede

## T2 — Checks existentes adaptam ao modo `--ai`
- **Owner**: Worker · **Est**: P · **Depende de**: T1
- **Paths**: `lib/core/project-smoke.ts`
- **Escopo**: `structure` roda `validateProjectStructure(dir, { includeNest: !env.ai })`.
  Confirmar `gate-inherited`: se `scripts/check-memory-maps.mjs` **não** viaja no modo
  `--skip-backend`, condicionar esse check a `!env.ai` (kill-criterion do plan). `generated`,
  `no-placeholders`, `json-valid` já são agnósticos.
- **Done**:
  - [ ] `runProjectSmoke({ ai: ['claude','copilot'] })` → todos os checks aplicáveis `ok`
  - [ ] `runProjectSmoke()` sem `ai` → veredito inalterado (backend ainda validado)

## T3 — Check `aiInstructionsCoherent`
- **Owner**: Worker · **Est**: M · **Depende de**: T2
- **Paths**: `lib/core/project-smoke.ts`
- **Escopo**: novo `Check` (`severity: 'critical'`, `dependsOn: 'generated'`). Quando `env.ai`:
  (a) `.ia-instructions/<ai>.md` existe para cada IA; (b) normaliza cada arquivo removendo linhas
  que casam os padrões de cabeçalho de `step02CopyInstructions` (original e reescrito) e afirma
  que os corpos normalizados são idênticos entre si; (c) `.ia-instructions/models.json` parseia,
  `fallback_chain` deep-equal a `env.ai`, `engines` tem chave por IA com `instruction_file`
  correto. Sem `env.ai` → `status: 'skipped'`. Adicionar a `SMOKE_CHECKS`.
- **Done**:
  - [ ] projeto gerado com `--ai claude,copilot` → `ai-instructions` `ok`
  - [ ] `tsc --noEmit` verde

## T4 — CLI: flag `--ai`
- **Owner**: Worker · **Est**: P · **Depende de**: T1
- **Paths**: `scripts/project-smoke.ts`, `lib/core/registry.ts`
- **Escopo**: `scripts/project-smoke.ts` parseia `--ai <lista>` (`--ai a,b` ou `--ai a --ai b`?
  seguir o padrão do `init-project` = CSV) → `runProjectSmoke({ full, ai })`. Mesma renderização
  de resultados/veredito/exit code. Registry: `usage`/`examples` de `project:smoke` citam `--ai`.
- **Done**:
  - [ ] `forja project:smoke --ai claude,copilot,gemini,codex` roda no tier barato, exit 0
  - [ ] `forja project:smoke` (sem `--ai`) inalterado
  - [ ] `forja help project:smoke` mostra `--ai`

## T5 — (dobrado em T4 — registry) — sem task própria

## T6 — CI: matriz `project:smoke --ai`
- **Owner**: Worker · **Est**: P · **Depende de**: T3, T4
- **Paths**: `.github/workflows/ci.yml`
- **Escopo**: job novo `project-smoke-ai` (ou step no `release-gate`) com
  `strategy: { fail-fast: false, matrix: { ai: ['claude', 'copilot', 'claude,copilot,gemini,codex'] } }`,
  `node-version: 22.x`, `npm ci`, `node bin/forja.ts project:smoke --ai ${{ matrix.ai }}`.
  Roda em `pull_request` e `push` (o `on:` atual já cobre).
- **Done**:
  - [ ] `ci.yml` parseia (YAML válido); o job aparece com 3 células
  - [ ] o `release-gate` e o `test` job seguem intactos

## T7 — Testes
- **Owner**: Worker · **Est**: M · **Depende de**: T3, T4
- **Paths**: `test/project-smoke.test.js` (existente — estender)
- **Escopo**: (a) `runProjectSmoke({ ai: ['claude','copilot'] })` num tmp → sem `fail`,
  `ai-instructions` `ok`; (b) gerar, **editar** `.ia-instructions/copilot.md` (mudar uma linha do
  corpo), re-rodar só o check `aiInstructionsCoherent` → `fail`; (c) `models.json` adulterado
  (`fallback_chain` fora de ordem) → `fail`. `{ concurrency: false }` se lento.
- **Done**:
  - [ ] `node --test test/project-smoke.test.js` verde

## T8 — Documentação + CHANGELOG
- **Owner**: Worker · **Est**: P · **Depende de**: T4, T6
- **Paths**: `docs/quick-reference.md` (ou `docs/dev-workflow.md`), `CHANGELOG.md`
- **Escopo**: `project:smoke --ai <lista>` no guia; CHANGELOG `[Unreleased]` — Adicionado
  (`project:smoke --ai`, check de coerência multi-IA, matriz de CI).
- **Done**:
  - [ ] `forja tools:doctor` → `docs-commands`, `commands-documented`, `docs-links` verdes

## T9 — Validação final + fecho
- **Owner**: Worker → Governance · **Est**: P · **Depende de**: T1–T8
- **Paths**: `specs/projeto-gerado-confiavel/spec.md`
- **Escopo**: bateria; `spec.md` §Evidências; mover status; handoff `review`.
- **Done**:
  - [ ] `tsc --noEmit`, `node --test test/*.test.js`, `forja spec:check`, `forja project:check` verdes — AC-8
  - [ ] `spec:set-status projeto-gerado-confiavel spec implementing` no início; handoff `worker →
        governance (review)` ao fim

---

## Mapa AC → task

| AC | Tasks | Verificação-chave |
|---|---|---|
| AC-1 | T1 | `runProjectSmoke({ ai })` via `init-project.ts` |
| AC-2 | T4 | `forja project:smoke --ai …` |
| AC-3 | T3 | check `aiInstructionsCoherent` |
| AC-4 | T2 | `structure` com `includeNest:!ai`; checks agnósticos |
| AC-5 | T6 | matriz `ci.yml` |
| AC-6 | T7 | verde + divergência injetada reprova |
| AC-7 | T4 | 4 IAs juntas, tier barato |
| AC-8 | T9 | bateria completa |

## Handoffs entre agentes

SDD Architect (spec+plan+tasks) → **Worker** (T1–T8) → **Governance** (T9 + `project:check`).
Registrar via Hermes no início da implementação.

## Evidências e estado real

- Nada executado — caixas `[ ]` abertas.
- **A validar já na T1**: `init-project.ts --skip-backend` sem rede / sem escrita fora do tmp;
  `check-memory-maps.mjs` viaja (ou não) no modo memória-only.
- **Sem dependência de branch** — a partir de `main`.
