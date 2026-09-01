# Plan: Architecture Constitution — ADRs como regras executáveis

- **Spec**: ./spec.md
- **Status**: approved
- **Criado em**: 2026-09-01

## 1. Abordagem técnica

Novo bounded context `packages/engineering/architecture` (autorizado por ADR-0078), puro domínio
(sem `fs`/rede — só parsing de string e comparação de listas), consumido por um script CLI
(`scripts/architecture.ts`) que faz a ponte com `fs` (ler ADRs) e `GraphLoop` (ler arestas
`DEPENDS_ON` reais). Vocabulário de frase reconhecida é pequeno e fixo (3 padrões: proibir
import, exigir dependência, proibir dependência) — qualquer linha de `## Constraints` fora desse
vocabulário vira regra `proposed` com `confidence < 1`, nunca `active` (AC-1).

## 2. Módulos afetados

| Caminho | Mudança | Risco |
|---|---|---|
| `packages/engineering/architecture/src/index.ts` | novo — `parseConstraintLine`, `compileConstitution`, `checkConstitution`, `explainRule` | Médio — lógica nova, mas pura/testável |
| `scripts/architecture.ts` | novo — `architecture:compile/check/status/explain/approve` | Baixo — I/O fino sobre o engine puro |
| `lib/core/registry.ts` | 5 comandos novos | Baixo |
| `packages/policy` (não muda código) — `ApprovalLedger` reaproveitado por `architecture:approve` | leitura/escrita via API já existente | Baixo |
| `memory/90-decisions/0078-*.md` | ganha `## Constraints` real (1 regra) — primeira prova de que o parser funciona sobre dado real do próprio repositório | — |
| `test/architecture-constitution.test.js` (novo) | testes do parser + compile + check (incluindo violação injetada em unidade, não em arquivo real) | — |

## 3. Diagrama de fluxo

```text
memory/90-decisions/*.md (## Constraints)
        │
        ▼
parseConstraintLine (determinístico, vocabulário fixo)
        │
        ▼
compileConstitution ──► .context/architecture/constitution.json (versionado em git)
        │
        ▼
checkConstitution (recebe rules + edges DEPENDS_ON já extraídas pelo GraphLoop existente)
        │
        ▼
ArchitectureCheckReport (compliant/violations, severidade, remediação sugerida)
```

## 4. Contratos (API/CLI/Schema)

```ts
// packages/engineering/architecture/src/index.ts
export type ArchitectureConstraintKind = 'forbid_import' | 'require_dependency' | 'forbid_dependency';
export interface ArchitectureConstraint { readonly kind: ArchitectureConstraintKind; readonly target: string; }
export interface ArchitectureRule {
  readonly id: string;
  readonly source: string;         // ex.: 'memory/90-decisions/0078-....md'
  readonly status: 'active' | 'proposed';
  readonly scope: { readonly paths: readonly string[] };
  readonly constraint: ArchitectureConstraint;
  readonly severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  readonly rationale: string;      // texto original da linha
  readonly confidence: number;     // 1 = padrão reconhecido; < 1 = ambíguo, fica proposed
}
export interface DependencyEdge { readonly fromPath: string; readonly targetLabel: string; }
export interface ArchitectureViolation { readonly ruleId: string; readonly severity: ArchitectureRule['severity']; readonly file: string; readonly target: string; readonly source: string; readonly remediation: string; }
export interface ArchitectureCheckReport { readonly compliant: number; readonly violations: readonly ArchitectureViolation[]; }

export function parseConstraintLine(line: string): { constraint: ArchitectureConstraint; scopeRaw: string; confidence: number } | undefined;
export function compileConstitution(adrs: readonly { source: string; content: string }[]): readonly ArchitectureRule[];
export function checkConstitution(rules: readonly ArchitectureRule[], edges: readonly DependencyEdge[]): ArchitectureCheckReport;
```

```bash
architecture:compile
architecture:check
architecture:status
architecture:explain <rule-id>
architecture:approve <rule-id>
```
(sem prefixo `forja` — nenhum existe ainda, mesma convenção já usada em SPEC-032/doc de arquitetura)

## 5. Decisões e alternativas

**D1**: `ArchitectureRule`/`ArchitectureConstraint` vivem em `packages/engineering/architecture`,
não em `packages/contracts`. O documento de arquitetura original (§6) sugeriu `packages/contracts`
— revisado aqui: nenhum outro pacote hoje precisa desses tipos além do próprio engine de
arquitetura e seu adapter CLI; colocá-los no contracts compartilhado cedo demais repetiria o erro
que ADR-0078 já evita para o pacote como um todo (acoplamento prematuro). Revisitar se
`packages/engineering/risk` (SPEC-034) precisar do mesmo vocabulário.

**D2**: vocabulário de frase fixo em português, 3 padrões (`não depende de` / `usa` / `não
acessa`), scope e target devem conter `/` (parecer caminho) para confidence=1. Alternativa
rejeitada: NLP/heurística mais permissiva — rejeitada explicitamente por AC-1 e pelo risco #1 do
spec (falso positivo em massa).

## 6. Dependências

- SPEC-032 (nós ADR com `documentStatus`) — usado por `architecture:status` para não compilar
  regra de ADR `superseded`/`deprecated` (verificação leve, não bloqueante se o dado não estiver
  disponível).
- `packages/policy.ApprovalLedger` — reaproveitado por `architecture:approve`.

## 7. Rollout

- [ ] Feature flag necessária? Não — comando novo, opt-in por natureza (ninguém chama sem saber).
- [ ] Migração de dados existentes? Não.
- [ ] Doc/persona impactada? README (comandos novos), `docs/architecture/`.

## 8. Sinais de fracasso (kill criteria)

Já registrado no `plan.md`-equivalente da spec master (`specs/engineering-intelligence/spec.md`,
apêndice): mais falso-positivo que sinal real sobre este próprio repositório após o Sprint 1
manda redesenhar o motor antes de avançar.
