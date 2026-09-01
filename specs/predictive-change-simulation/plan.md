# Plan: Predictive Change Simulation

- **Spec**: ./spec.md
- **Status**: approved
- **Criado em**: 2026-09-01

## 1. Abordagem técnica

`scripts/simulate.ts`, adapter puro de composição (mesmo padrão de `scripts/engineer.ts`) — nenhum
pacote novo em `packages/engineering`, porque não há lógica de domínio nova aqui, só orquestração
de engines já existentes (`SandboxEngine`, `checkConstitution`, `assessRisk`).

Ciclo do sandbox usado (D1): `create({sourceRef: ref})` → `prepare` → `execute(testCommand)` →
`reject` → `destroy`. **Não** usa `validate`/`diff`/`promote` do `SandboxEngine` — esses passos
existem pra "modifiquei o worktree, quero decidir se aplico as mudanças na árvore real"; aqui o
worktree já nasce checked out no `ref` (nada é modificado depois), e a árvore real nunca deveria
receber nada desta simulação. `reject()` aceita o estado `'validating'` (onde a sessão fica logo
após `execute()`) — não precisa passar por `validate()` pra chegar lá. Isso torna
"nunca promove" uma propriedade estrutural do código (a função `promote()` simplesmente nunca é
chamada em lugar nenhum deste arquivo), não uma disciplina que dependeria de lembrar de não chamar.

## 2. Módulos afetados

| Caminho | Mudança | Risco |
|---|---|---|
| `scripts/simulate.ts` | novo — `forja simulate <ref>` | Médio — orquestra sandbox real + grafo temporário, mas cada peça já existe e testada |
| `lib/core/registry.ts` | 1 comando novo | Baixo |
| `test/simulate-cli.test.js` (novo) | fixture git isolada, verifica não-promoção e destruição do worktree | — |

## 3. Diagrama de fluxo

```text
forja simulate <ref> [--command "npm test"]
        │
        ├─► SandboxEngine.create({sourceRef: ref}) — GitWorktreeBackend, worktree isolado real
        ├─► SandboxEngine.prepare
        ├─► SandboxEngine.execute({command}) — roda o teste DENTRO do worktree
        │             │
        │             ▼ (sessão em 'validating')
        ├─► SqliteMigrationRunner sobre um SQLite TEMPORÁRIO (mkdtemp, não getWorkspaceDbPath)
        ├─► GraphIndexer.sync(GitGraphDocumentSource(session.root)) — indexa o worktree isolado
        ├─► checkConstitution(constitution.json do worktree, arestas do grafo temporário)
        ├─► buildRiskInput(changedFiles, database-temporário) + assessRisk
        │
        ├─► SandboxEngine.reject(session.id) — nunca promote()
        └─► SandboxEngine.destroy(session.id) — sempre, mesmo em erro (try/finally)
                      │
                      ▼
        SimulationReport { testResult, architectureCheck, risk, recommendation }
```

## 4. Contratos (CLI/Schema)

```ts
// scripts/simulate.ts
interface SimulationReport {
  readonly ref: string;
  readonly changedFiles: readonly string[];
  readonly testCommand: string;
  readonly testResult: { readonly exitCode: number; readonly durationMs: number; readonly passed: boolean };
  readonly architectureCheck: ArchitectureCheckReport | { readonly note: string };
  readonly risk: ChangeRiskAssessment;
  readonly recommendation: 'promote' | 'review' | 'discard';
}
```

```bash
simulate <ref> [--command "npm test"] [--json]
```

## 5. Decisões e alternativas

**D1**: ciclo `create→prepare→execute→reject→destroy`, sem `validate`/`diff`/`promote` — ver §1.
Alternativa considerada: usar o ciclo completo de `runSandboxedCapability` — rejeitada porque esse
helper foi desenhado pra capabilities que **modificam** o worktree via `work()` e depois decidem
promover; aqui o "trabalho" é só checkout+teste, sem modificação, e a promoção nunca deveria
acontecer — usar o ciclo completo introduziria um caminho de código (`promote`) que não deveria
nunca ser exercitado, risco desnecessário pro que AC-3 exige.

**D2**: `changedFiles` vem de `git diff --name-only HEAD <ref>` (reaproveita
`lib/core/risk-collect.ts.changedFiles`, mesma função de `risk:assess`/`forja engineer`) — rodado
**antes** de criar o sandbox, contra a árvore real (só leitura, `git diff` não modifica nada).

**D3**: grafo + banco da simulação são **completamente isolados** do workspace real — SQLite em
`fs.mkdtempSync`, apontando `FORJA_GRAPH_ROOT` pro `session.root` só durante a chamada de
`buildRiskInput`/`checkConstitution` (restaurado no `finally`, mesmo em exceção). Alternativa
rejeitada: reaproveitar `getWorkspaceDbPath()` — violaria AC-2/NFR explicitamente (contaminaria o
grafo persistente com o estado de um ref que pode nunca ser integrado).

**D4**: `recommendation` — `discard` se o teste falhar (hard gate); senão `review` se houver
violação de arquitetura `active` OU `risk.autonomyBand` for `supervised`/`human_in_the_loop`;
senão `promote`. Mesma filosofia de "informa, não decide" de `RiskEngine` (SPEC-034 D3) —
`forja simulate` nunca aplica a mudança sozinho independente da recomendação.

## 6. Dependências

- SPEC-033 (`checkConstitution`), SPEC-034 (`assessRisk`/`buildRiskInput`, `lib/core/risk-collect.ts`)
  — reaproveitados sem mudança.
- `packages/sandbox.SandboxEngine`/`packages/adapter-git.GitWorktreeBackend` — já existentes.

## 7. Rollout

Sem migração, sem feature flag — comando novo, opt-in.

## 8. Kill criteria

Se a recomendação não corresponder a julgamento humano sobre um ref real (§8 do spec), os pesos de
D4 são revisados antes de qualquer consumo automático futuro (fora de escopo desta spec de
qualquer forma, §5 "Fora").
