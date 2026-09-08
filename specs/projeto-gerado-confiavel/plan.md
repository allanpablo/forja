# Plan: projeto-gerado-confiavel

- **Spec**: ./spec.md
- **Status**: approved
- **Criado em**: 2026-09-08

> Como vamos construir o que a spec define. Sem código aqui — só estrutura e decisões.

## 1. Abordagem técnica

`lib/core/project-smoke.ts` já é o gate certo e já usa o runner de `checks.ts`. Estende-se:
`SmokeEnv` ganha `ai?: string[]`; quando presente, `withGeneratedProject` gera via
`bin/init-project.ts <dir> --ai <lista> --skip-backend --force` (memória + instruções, **sem
rede**) em vez de `create-memory-nest-kit` direto. O `structure` check passa a rodar
`includeNest: false` nesse modo (não há `backend/`). Um check novo `aiInstructionsCoherent`
(condicionado a `env.ai`) prova que `.ia-instructions/<ai>.md` de cada IA da lista tem o mesmo
corpo e que `models.json` bate com a lista. `scripts/project-smoke.ts` ganha `--ai`. O CI roda
uma matriz de 3 combinações no tier barato. `project:smoke` sem `--ai` fica idêntico.

## 2. Módulos afetados

| Caminho | Mudança | Risco |
|---|---|---|
| `lib/core/project-smoke.ts` | editar — `SmokeEnv.ai?`; `withGeneratedProject` decide o gerador por `ai`; `HOME` isolado no `spawn` quando `ai`; `structure` usa `includeNest: !ai`; `SMOKE_CHECKS` ganha `aiInstructionsCoherent`; `runProjectSmoke({ ai? })` | M |
| `scripts/project-smoke.ts` | editar — flag `--ai <lista>` → `runProjectSmoke({ full, ai })` | B |
| `lib/core/registry.ts` | editar — `--ai` no `usage`/`examples` de `project:smoke` | B |
| `.github/workflows/ci.yml` | editar — job (ou step em job novo) `project-smoke-ai` com `strategy.matrix.ai: ['claude', 'copilot', 'claude,copilot,gemini,codex']`, `fail-fast: false`, rodando `node bin/forja.ts project:smoke --ai ${{ matrix.ai }}` | B |
| `test/project-smoke.test.js` | editar/criar — `runProjectSmoke({ ai })` verde; divergência injetada reprova `aiInstructionsCoherent` | M |
| `docs/quick-reference.md` ou `docs/dev-workflow.md`, `CHANGELOG.md` | editar — `project:smoke --ai` | B |

## 3. Diagrama de fluxo

```
forja project:smoke [--ai a,b,c] [--full]
   │
   └── runProjectSmoke({ full, ai })
         └── withGeneratedProject(fn, { root, spawn, ai })
               ai ausente → spawn(create-memory-nest-kit, [dir, --force])         (projeto completo, como hoje)
               ai presente → spawn(init-project.ts, [dir, --ai a,b,c, --skip-backend, --force], { HOME: tmp })
         └── run({ checks: SMOKE_CHECKS, env: { ...base, projectDir, ai } })
               generated · no-placeholders · json-valid
               structure          → includeNest: !env.ai
               gate-inherited
               ai-instructions     → SÓ quando env.ai: <ai>.md existem, corpos idênticos, models.json bate
               builds (--full)     → skipped quando env.ai (sem backend)

CI:  job project-smoke-ai  (matrix.ai = claude | copilot | claude,copilot,gemini,codex, fail-fast:false)
       node bin/forja.ts project:smoke --ai ${{ matrix.ai }}
```

## 4. Contratos (API/CLI/Schema)

```ts
// lib/core/project-smoke.ts
interface SmokeEnv {
  root: string; fs: typeof fs; projectDir?: string; full: boolean;
  ai?: readonly string[];          // novo: lista de IAs; presente ⇒ gera via init-project.ts
  spawn: (cmd, args, opts?) => { stdout: string; stderr: string; code: number };
}
export function runProjectSmoke(opts?: { full?: boolean; ai?: string[]; env?: Partial<SmokeEnv> }): Promise<Result[]>;
```

**`aiInstructionsCoherent`** (`severity: 'critical'`, `dependsOn: 'generated'`): quando `env.ai`
está setado —
1. cada `<ai>` da lista tem `.ia-instructions/<ai>.md`;
2. removendo as linhas que casam os 2 regexes de `step02CopyInstructions` (`^# Instruções para .+ — Forja$`
   e `^> Guia para .+ multi-IA por design\.$`, e a versão já reescrita), o corpo dos `<ai>.md` é
   **idêntico** byte a byte entre todos;
3. `.ia-instructions/models.json` parseia, `fallback_chain` deep-equal a `env.ai`, `engines` tem
   uma chave por IA com `instruction_file` = `.ia-instructions/<ai>.md`.
Sem `env.ai` → `status: 'skipped'`.

**CLI**: `--ai claude,copilot` → `ai = 'claude,copilot'.split(',').map(s => s.trim()).filter(Boolean)`.

## 5. Decisões e alternativas

**D1 — REVISADO na implementação: `create-memory-nest-kit --only-memory` + `writeAiInstructions()`
extraído para `lib/`.** `init-project.ts` **não roda em dev** (hardcoda `bin/create-memory-nest-kit.js`
e `.mjs` em vários pontos; só funciona do pacote publicado) e trata o path como nome de projeto de
workspace (escreve `~/forja-workspace/projects/<slug>`). Consertar tudo isso seria refator grande
(kill-criterion). Em vez disso: a lógica de `step02CopyInstructions` vira
`lib/multi-ai-instructions.ts` `writeAiInstructions(projectDir, aiList, { kitRoot })` (+
`stripInstructionHeader` para o check); `init-project.ts step02` passa a **delegar** para ela; o
smoke gera memória com `create-memory-nest-kit --only-memory` (funciona em dev, sem rede, sem tocar
`~`) e chama `writeAiInstructions`. Ganho colateral: a escrita multi-IA vira função `lib/` testada,
compartilhada por gerador e smoke — que é o coração de W8.
Rejeitado: consertar os hardcodes `.js`/`.mjs` de `init-project.ts` (fora do escopo);
gerar com backend (step04 = `npm install`).

**D2 — `structure` adapta com `includeNest: !env.ai`, não um check separado.** O modo `--ai` é
memória-only; validar estrutura NestJS ali seria um falso negativo. Rejeitado: duplicar o check.

**D3 — `aiInstructionsCoherent` normaliza removendo linhas por regex, não por contagem fixa.**
`step02` reescreve 2 linhas específicas; o check remove qualquer linha que case os padrões
originais **ou** os reescritos, e compara o resto. Rejeitado: `slice(2)` (frágil se o cabeçalho
crescer).

**D4 — Matriz de 3 combinações, `fail-fast: false`.** `claude` (1 IA), `copilot` (outra 1, pega
divergência de header por IA), e as 4 juntas (o caso completo). Rejeitado: só as 4 juntas (não
isola qual IA quebrou); rejeitado: todas as permutações (custo sem retorno).

**D5 — Sem ADR.** `project:smoke` já existe (SPEC-015); a geração multi-IA já é fonte única.
Isto é extensão + wiring + um check. Se o `plan` revelar que `init-project.ts` precisa de
refactor para ser testável, aí sim abre-se ADR.

## 6. Dependências

- Independente das Ondas 1–2. Branch a partir de `main`.
- **Pacotes npm**: nenhum.
- **Migrações**: nenhuma.
- Assume `init-project.ts --skip-backend` sem rede (validar na T1) e que ele copia
  `scripts/check-memory-maps.mjs` (o `gate-inherited` check depende disso — validar na T2).

## 7. Rollout

- [ ] Feature flag: não.
- [ ] Migração de dados: não.
- [ ] Doc/persona: `docs/quick-reference.md` / `docs/dev-workflow.md` (`project:smoke --ai`),
      `docs/personas/qa/README.md` se mencionar smoke.
- [ ] `CHANGELOG.md` `[Unreleased]`: Adicionado (`project:smoke --ai`, check `aiInstructionsCoherent`,
      matriz de CI). Sem quebras.

## 8. Sinais de fracasso (kill criteria)

- `init-project.ts --skip-backend` puxa rede ou escreve em `~` sem isolamento viável → gerar
  só a memória (`create-memory-nest-kit --only-memory`) e chamar a lógica de instruções por um
  export novo e mínimo de `init-project.ts`; se isso for refactor grande, W8 vira spec própria.
- `gate-inherited` não vale no modo memória-only (o script não viaja com `--skip-backend`) →
  condicionar `gate-inherited` a `!env.ai` e cobrir a herança do gate só no smoke completo.
- A matriz de 3 células passa de ~1 min → cortar para 2 combinações (`copilot` e as 4 juntas).

## Evidências e estado real

| AC | Task | Verificação |
|---|---|---|
| AC-1 | T1 | `runProjectSmoke({ ai })` gera via `init-project.ts`; sem `ai` inalterado |
| AC-2 | T4 | `forja project:smoke --ai claude,copilot` — mesmo veredito/exit |
| AC-3 | T3 | check `aiInstructionsCoherent` (arquivos, corpos idênticos, `models.json`) |
| AC-4 | T2 | checks existentes rodam sobre a saída do `init-project.ts` (`structure` com `includeNest:false`) |
| AC-5 | T6 | `ci.yml` matriz `ai` no tier barato, PR + push |
| AC-6 | T7 | teste verde + teste de divergência injetada reprova |
| AC-7 | T4 | `forja project:smoke --ai claude,copilot,gemini,codex` local passa |
| AC-8 | T9 | bateria completa verde; `ci.yml` revisado |

- **Descoberta**: `--ai` é do `init-project.ts`, não do `create-memory-nest-kit`; as instruções
  já derivam de `.gemini-instructions.md` (fonte única).
- **Hipótese, não medição**: métrica de §8 depende de um PR real quebrar o gerador; até lá, o
  teste de regressão (T7) é a evidência.
