# Spec: AI Code Provenance + AI-SBOM

- **ID**: SPEC-039
- **Status**: done
- **Owner**: apk
- **Criado em**: 2026-09-01
- **Sprint alvo**: Sprint 7 (Fase 5 da visão original)
- **ADRs relacionadas**: ADR-0078; depende de `RuntimeRun`/`AgentIdentity` (`packages/contracts`,
  já existentes) e `SqliteRuntimeRunStore` (já existente)

> Gap analysis original (`docs/architecture/...` §3): "`Observation` já tem `model`, `agentId`,
> `runId`, `inputHash`, `contextRefs` — falta só ligar linha de código a `Observation`... Construir,
> dado que os campos-fonte já existem." `RuntimeRun.changedFiles`+`RuntimeRun.agent` têm exatamente
> o dado necessário pra provenance em **granularidade de arquivo** — a granularidade que este
> repositório de fato coleta hoje.

## 1. Problema

Nada liga "este arquivo mudou neste run" a "quem/qual agente produziu essa mudança" de forma
consultável — `RuntimeRun` já grava `changedFiles`+`agent` por run, mas essa informação fica presa
em cada `RuntimeRun` isolado, sem uma view "quem tocou este arquivo, ao longo do tempo" nem um
relatório agregado de proveniência do código gerado por IA.

## 2. Proposta de valor

`forja provenance:record <run-id>` extrai proveniência (arquivo↔agente↔run) de um `RuntimeRun` já
persistido; `forja blame <file>` mostra o histórico de quem tocou um arquivo; `forja sbom` agrega
tudo num relatório por agente/modelo — um "AI-SBOM" honesto sobre o que já foi coletado, não uma
promessa de rastreamento que o sistema não tem dado pra sustentar.

## 3. User stories

- **Como** governance, **quero** saber quais agentes/modelos tocaram um arquivo, **para que** eu
  saiba a quem perguntar ou o que revisar com mais cuidado.
- **Como** compliance/auditoria, **quero** um relatório agregado de proveniência do código gerado
  por IA neste projeto, **para que** eu tenha uma resposta estruturada, não "não sabemos".

## 4. Critérios de aceite (Definition of Done)

- [x] AC-1: `extractProvenance` (função pura, `packages/engineering/provenance`) recebe um
      `RuntimeRun` e devolve `ProvenanceRecord[]` (um por arquivo em `changedFiles`) — nenhum dado
      inventado além do que o run já registrou.
- [x] AC-2: granularidade é **arquivo**, não linha — `ProvenanceRecord.lines` existe no tipo (mesmo
      shape do `ProvenanceEngine.recordGeneration` desenhado no doc de arquitetura §11) mas fica
      `undefined` nesta spec, porque nenhuma fonte de dado real deste repositório rastreia hunks de
      linha por run hoje. Nunca fingir granularidade de linha que não existe (mesmo princípio de
      "nunca escondida" já usado em `AgentReputationScore.confidence`).
- [x] AC-3: `forja provenance:record <run-id>` persiste os `ProvenanceRecord`s de um `RuntimeRun`
      já existente (`SqliteRuntimeRunStore.get`, já existente) — sem tocar em `RuntimeEngine`, sem
      novo ponto de coleta automática (essa integração é spec própria futura, ver §5).
- [x] AC-4: `forja blame <file>` lista os registros de proveniência de um arquivo, mais recentes
      primeiro.
- [x] AC-5: `forja sbom [--json]` agrega todos os registros por **agente** (contagem de arquivos,
      lista de arquivos) — derivado inteiramente do que já foi gravado, sem nova fonte de verdade.
      Não agrega por modelo: `AgentIdentity` (o tipo real de `RuntimeRun.agent`) não carrega um
      campo de modelo de LLM hoje — `ProvenanceRecord.model` fica declarado no tipo mas sempre
      `undefined`, mesmo raciocínio de AC-2 pra `lines`.

## 5. Escopo

**Dentro**: `extractProvenance` (motor puro); `SqliteProvenanceStore` (reaproveita
`SqliteJsonRepository`, sem migration nova — mesmo padrão de `SqliteAgentProfileStore`);
`provenance:record`/`blame`/`sbom` (CLI).

**Fora** (spec própria futura, mesmo princípio de escopo já usado nas specs anteriores):
- Coleta automática de proveniência no fim de todo `RuntimeRun` (integração com `RuntimeEngine`) —
  esta spec só extrai de runs já persistidos, sob demanda; automatizar a coleta é uma mudança no
  caminho crítico do runtime, merece spec própria com sua própria análise de risco.
- Granularidade de linha (`git blame`-like) — exigiria uma fonte de dado nova (hunks de diff por
  run) que não existe hoje; ver AC-2.
- AI-SBOM em formato padrão da indústria (CycloneDX/SPDX) — o relatório desta spec é interno,
  formato próprio; adotar um formato padrão é decisão separada, não bloqueante pra esta fundação.

## 6. NFRs / restrições

- Determinístico — nenhum LLM em nenhum ponto.
- `ProvenanceRecord` nunca afirma granularidade de linha sem dado real (AC-2).
- Zero migration SQLite nova (mesmo padrão de SPEC-036).

## 7. Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| `forja blame`/`sbom` prometerem granularidade de linha que não existe | Média (nome "blame" sugere `git blame`) | Média (confiança quebrada quando descoberto) | AC-2 explícito; saída de `blame` deixa claro que é por arquivo, não por linha |
| `provenance:record` divergir do `RuntimeRun` original se rodado depois de mudanças | Baixa | Baixa | `RuntimeRun` é imutável após completar (mesmo padrão já estabelecido); `provenance:record` sempre lê o estado atual, idempotente por natureza |

## 8. Métricas de sucesso

Rodar `provenance:record` sobre 1+ `RuntimeRun` real ou sintético documentado como tal, e confirmar
que `blame`/`sbom` refletem corretamente o que foi gravado — revisão humana, mesma metodologia das
specs anteriores.

**Validado** (`test/provenance-cli.test.js`): `RuntimeRun` sintético documentado como tal (este
workspace de desenvolvimento ainda não acumulou runs reais suficientes, mesma situação já
registrada em SPEC-036 §8) com 2 arquivos alterados — `provenance:record` gravou os 2 registros,
`blame` de cada arquivo mostrou o agente/run corretos, `sbom` agregou corretamente por agente.
Regravar o mesmo run é idempotente (chave `runId:file`), não duplica.
