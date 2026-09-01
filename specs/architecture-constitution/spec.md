# Spec: Architecture Constitution — ADRs como regras executáveis

- **ID**: SPEC-033
- **Status**: approved
- **Owner**: apk
- **Criado em**: 2026-09-01
- **Sprint alvo**: Sprint 1
- **ADRs relacionadas**: ADR-0078; depende de SPEC-032 (nós ADR) e reaproveita o motor de
  comparação "isso que era verdade parou de ser" desenhado em `specs/drift-sentinel/spec.md`
  (SPEC-030).

## 1. Problema

Uma decisão registrada em ADR (`memory/90-decisions/NNNN-*.md`) hoje só é verificada por um
humano lembrar de reler o documento. Nada impede que o código viole uma restrição arquitetural
documentada dias, semanas ou meses atrás, sem que ninguém perceba — a mesma classe de problema que
`drift-sentinel` resolve para relações genéricas do grafo, aqui aplicada especificamente a
restrições de arquitetura.

## 2. Proposta de valor

ADRs com uma seção `## Constraints` em formato estruturado (ver §4) compilam para regras
executáveis (`.context/architecture/constitution.json`, versionado em git), verificáveis por
`forja architecture:check` a qualquer momento — inclusive como gate de CI, quando o projeto
consumidor optar por isso.

## 3. User stories

- **Como** sdd-architect, **quero** que uma restrição documentada em ADR seja verificada
  automaticamente, **para que** "documentado" e "em vigor" nunca divirjam sem ninguém notar.
- **Como** governance, **quero** um relatório de violações por severidade, **para que** eu saiba
  quais bloqueiam merge e quais são só aviso.
- **Como** desenvolvedor, **quero** `architecture:explain <rule-id>` antes de contestar uma
  violação, **para que** eu entenda o porquê sem precisar caçar a ADR original.

## 4. Critérios de aceite (Definition of Done)

- [ ] AC-1: formato de `## Constraints` em ADR é determinístico e documentado (ex.: lista com
      prefixo fixo — `- billing não importa database diretamente` vira
      `{kind: 'forbid_import', patterns: ['**/database/**']}` só quando a frase casa um padrão
      reconhecido; frases que não casam viram regra `proposed` com `confidence < 1`, nunca
      `active` por adivinhação).
- [ ] AC-2: `forja architecture:compile` lê `memory/90-decisions/*.md` com `## Constraints`,
      produz `ArchitectureRule[]`, grava `.context/architecture/constitution.json`.
- [ ] AC-3: `forja architecture:check` compara `constitution.json` contra o Engineering Graph
      (arestas `depends_on`/`imports` já extraídas por `extractDeterministicRelations`) e reporta
      violações com severidade (`info|low|medium|high|critical`), path do arquivo, ADR de origem,
      remediação sugerida.
- [ ] AC-4: `forja architecture:status` resume: N regras ativas, N propostas, última compilação.
- [ ] AC-5: `forja architecture:explain <rule-id>` mostra a ADR de origem, o texto original da
      restrição, e a severidade/razão.
- [ ] AC-6: uma regra `proposed` só vira `active` por `forja architecture:approve <rule-id>`
      (reaproveita `ApprovalLedger` de `packages/policy` — **não** um sistema de aprovação
      paralelo).
- [ ] AC-7: `architecture:check` pode participar de `check:all` como item opcional
      (`--with-architecture`), não obrigatório por padrão (mesma decisão de opt-in já tomada para
      `drift:check` em SPEC-030 AC-5, pelo mesmo motivo: custo em repos grandes ainda não medido).

## 5. Escopo

**Dentro**: compile/check/status/explain/approve; parser determinístico de `forbid_import`/
`require_dependency`/`forbid_dependency` (os três tipos de restrição citados no exemplo da visão
original); severidade configurável.

**Fora**: sugestão de regra via LLM (mencionada na visão como "Fase 6+", não nesta spec — ver
`ArchitectureConstraint` no documento de arquitetura, campo `confidence` já reservado para quando
isso existir); auto-correção de violação (só reporta, nunca aplica); tipos de constraint além dos
três listados (ex.: regras de nomenclatura, limites de complexidade) — aditivo depois que os três
básicos estiverem em produção.

## 6. NFRs / restrições

- **LLM nunca decide regra `active` sozinho** — princípio de segurança explícito da visão
  original, reforçado pela postura fail-closed já em vigor no resto do framework desde a
  auditoria de 2026-08-31.
- `constitution.json` é artefato de git, não linha SQLite — precisa ser revisável em PR como
  qualquer outro artefato gerado (mesma categoria de `.context/forja-runs.jsonl`).
- Falso positivo é o risco central (ver riscos) — parser determinístico só reconhece padrões de
  frase explícitos; qualquer coisa fora do padrão vira `proposed`, nunca `active` por default.

## 7. Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Parser de linguagem natural de `## Constraints` interpretar errado uma frase | Alta (é a natureza do problema) | Alta (falso positivo em massa) | Vocabulário de frase reconhecida é pequeno e explícito (AC-1); fora do vocabulário = `proposed`, nunca `active` |
| `architecture:check` virar ruído e ser ignorado | Média | Alta (perde todo o valor) | AC-7 opt-in até o sinal ser medido; kill criteria já registrado no `plan.md` da spec master |
| Conflito entre duas ADRs com constraints contraditórias | Baixa | Média | `architecture:compile` reporta conflito explicitamente como erro de compilação, não escolhe uma silenciosamente |

## 8. Métricas de sucesso

Compilar as ADRs reais deste repositório (`memory/90-decisions/`) produz pelo menos uma regra
`active` verificável, e `architecture:check` roda sem falso positivo sobre o código atual (linha de
base limpa, igual ao Sprint 1 do plan.md da spec master).
