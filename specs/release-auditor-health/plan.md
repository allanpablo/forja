# Plan: release-auditor-health

- **Spec**: ./spec.md
- **Status**: done
- **Criado em**: 2026-08-17

> Como vamos construir o que a spec define. Sem código aqui, só estrutura e decisões.

## 1. Abordagem técnica

**Compor, não reimplementar.** O Release Auditor continuará sendo uma persona de julgamento, sem
probes próprios. Seu procedimento passa a executar `tools:doctor`, que já apresenta
`lib/core/health.ts`, e só então `release:check --publish`, que preserva o contrato estrito de
pré-publicação. Um teste lê o prompt como contrato e garante presença, ordem e flags dos comandos.

## 2. Módulos afetados

| Caminho | Mudança | Risco |
|---|---|---|
| `.claude/agents/release-auditor.md` | editar procedimento, checks e regras de julgamento | B |
| `AGENTS.md` | alinhar descrição canônica do papel aos dois gates | B |
| `test/release-auditor.test.js` | criar teste do contrato do procedimento | B |
| `memory/40-delivery/current-sprint.md` | substituir candidatos obsoletos pelo item em execução | B |

Nenhum módulo executável de health, release ou registry será alterado.

## 3. Diagrama de fluxo

```text
Release Auditor
      |
      +--> npm run tools:doctor
      |         |
      |         +--> critical fail: REPROVADO, parar e reportar fix
      |         `--> ok/warn: continuar
      |
      `--> npm run release:check -- --publish
                |
                +--> fail: REPROVADO
                `--> ok: parecer, ressalvas e validade perecível
```

## 4. Contratos

O contrato público continua sendo CLI existente:

```text
npm run tools:doctor
npm run release:check -- --publish
```

O primeiro comando deve aparecer antes do segundo. `--publish` é obrigatório. Avisos são lidos e
relatados, mas apenas falhas críticas bloqueiam. O agente nunca executa `npm publish`.

## 5. Decisões e alternativas

**D1: Consumir health por `tools:doctor`.** Alternativa rejeitada: importar `runChecks()` num script
novo para o agente, pois criaria outra superfície executável sem necessidade.

**D2: Preservar dois comandos explícitos.** Alternativa rejeitada: trocar por `check:all --full`,
pois hoje o agregador chama `runReleaseChecks({})` sem `publish: true`; árvore suja seria aviso.

**D3: Testar o prompt como contrato.** O teste verifica índices dos comandos no texto, a flag
`--publish` e a proibição de `npm publish`. Alternativa rejeitada: testar só presença por grep, que
não detectaria ordem invertida nem enfraquecimento da flag.

Nenhuma decisão é estrutural ou irreversível. ADR novo não é necessário; o plano aplica ADR-0023 e
ADR-0024.

## 6. Dependências

- **Specs**: SPEC-009/ADR-0023 e SPEC-010/ADR-0024, ambas concluídas.
- **Pacotes npm**: nenhum.
- **Migrações de dados/memory**: nenhuma.

## 7. Rollout

- [x] Feature flag necessária? Não, é procedimento interno de governança.
- [x] Migração de dados existentes? Não.
- [x] Doc/persona impactada? Release Auditor e sua descrição canônica em `AGENTS.md`.
- [x] Rodar teste direcionado, `types:check`, `project:check`, `tools:doctor` e `spec:check`.
- [x] Registrar handoff para Governance após implementação.

## 8. Sinais de fracasso

- A solução introduz probe ou lógica de severidade fora de `lib/core/health.ts`.
- `release:check --publish` deixa de ser obrigatório ou é substituído pelo agregador não estrito.
- O teste fica acoplado à redação completa do prompt, em vez de somente ao contrato operacional.
