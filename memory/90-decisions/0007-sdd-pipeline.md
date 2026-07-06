# ADR-0007: Pipeline Spec-Driven obrigatório para features não-triviais

- **Status**: accepted
- **Data**: 2026-05-10
- **Tags**: sdd, methodology, governance

## Contexto
AGENTS.md descrevia um "SDD Architect" mas não havia mecânica que forçasse spec antes de código. Trabalho começava direto na implementação, decisões eram tomadas no PR (tarde), e o "porquê" se perdia no tempo.

## Decisão
Adotar pipeline em 3 fases vinculadas:

1. **`spec.md`** — produto define problema, AC, NFRs, escopo
2. **`plan.md`** — SDD Architect define arquitetura, contratos, alternativas; abre ADRs para decisões estruturais
3. **`tasks.md`** — decomposição executável com owners

CLI `scripts/spec-cli.mjs` força ordem: `plan` exige `spec` em `approved+`; `tasks` exige `plan` em `approved+`. `spec:check` falha CI quando há violação.

Lista explícita de "quando NÃO precisa spec" em `specs/README.md` (bugfixes 1-line, renames, doc updates, dep bumps) — evita transformar SDD em burocracia.

## Alternativas consideradas
- **GitHub Issues + PR template** — rejeitada: não enforça ordem, sem separação entre "o quê" e "como"
- **ADR como única forma** — rejeitada: ADR é decisão pontual, não rastreia execução
- **Spec opcional** — rejeitada: viraria letra morta como o "Spec-Driven Architect" da versão anterior

## Consequências
**Positivas**: rastreabilidade decisão → impl, onboarding de novos agentes mais barato, AC mensuráveis evitam scope creep.
**Negativas**: fricção inicial (~10min por feature). Mitigada por templates e excluindo trabalhos triviais.

## Rastreamento
- `specs/`, `scripts/spec-cli.mjs`
- `package.json` (scripts `spec:*`)
- SPEC-001 = pipeline-sdd-e-orquestracao (meta-spec deste trabalho)
