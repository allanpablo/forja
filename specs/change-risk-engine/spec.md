# Spec: Change Risk Engine

- **ID**: SPEC-034
- **Status**: draft
- **Owner**: apk
- **Criado em**: 2026-09-01
- **Sprint alvo**: Sprint 2
- **ADRs relacionadas**: ADR-0078; depende de SPEC-032 (blast radius via grafo) e SPEC-033
  (violação de arquitetura como fator de risco)

## 1. Problema

Hoje, o único sinal de risco de uma mudança é o `risk: RiskLevel` estático declarado na
`CapabilityDefinition` (`low|medium|high|critical`) — um valor fixo por capability, não calculado a
partir da mudança real (quantos arquivos, quantos módulos afetados, se viola arquitetura, se o
domínio tem histórico de falha). Duas mudanças na mesma capability podem ter risco real muito
diferente e recebem o mesmo tratamento de política.

## 2. Proposta de valor

`forja risk:assess "<mudança>"` produz um score 0-100 explicável (fatores nomeados, com evidência),
que o Policy Engine pode opcionalmente consultar para calibrar a exigência de aprovação além do
`risk` estático da capability.

## 3. User stories

- **Como** governance, **quero** um score de risco com fatores visíveis, **para que** eu confie
  na exigência de aprovação em vez de tratá-la como arbitrária.
- **Como** desenvolvedor, **quero** `risk:explain` mostrando exatamente por que um score saiu alto,
  **para que** eu saiba o que reduzir (mais teste? menos arquivos? revisão de arquitetura?) antes
  de tentar de novo.

## 4. Critérios de aceite (Definition of Done)

- [ ] AC-1: `RiskEngine.assess(input): ChangeRiskAssessment` (interface pura, sem I/O) implementa a
      fórmula documentada em `docs/architecture/FORJA-3-ENGINEERING-INTELLIGENCE-ARCHITECTURE.md`
      §9, com os 7 fatores nomeados e pesos default configuráveis.
- [ ] AC-2: cada fator do assessment carrega `evidenceIds` (nós/arestas do grafo, `Observation`s
      históricas) — nenhum score sem rastro de onde veio.
- [ ] AC-3: `confidence` do assessment reflete a fração de fatores com dado real disponível — um
      projeto sem histórico de falha ainda produz um score, mas com confiança visivelmente menor,
      nunca escondida.
- [ ] AC-4: `forja risk:assess "<mudança>"` (CLI) e `forja risk:explain <assessment-id>` funcionais.
- [ ] AC-5: interface `RiskAssessor` pequena e opcional, consumível por `PolicyEngine` — `policy`
      não importa `packages/engineering/risk` diretamente (mesma direção de dependência estrutural
      de `CapabilityPolicy` hoje: satisfeita por forma, não por import).
- [ ] AC-6: faixas de autonomia (0-25 autonomous / 26-50 autonomous_with_review / 51-75 supervised
      / 76-100 human_in_the_loop, sugeridas na visão original) são **configuração default**, nunca
      constante fixa no código — mesmo padrão já usado por `RuntimeLimits`/`PolicyLimits`.

## 5. Escopo

**Dentro**: os 7 fatores documentados em §9 do doc de arquitetura; interface pura `RiskEngine`;
CLI `risk:assess`/`risk:explain`; interface de consumo opcional pelo Policy Engine.

**Fora**: aplicação automática de `REQUIRE_APPROVAL`/`DENY` a partir do score sem uma regra de
política explícita configurada para isso (o score informa a decisão, não a toma sozinho — decisão
de política continua sendo do `PolicyEngine`, nunca do `RiskEngine`); UI/heatmap de risco (Fase
posterior).

## 6. NFRs / restrições

- Determinístico onde possível; nenhum fator depende de chamada de LLM.
- `RiskEngine` não tem efeito colateral — é uma função pura sobre dados já coletados em outro
  lugar (grafo, `Observation`, `architecture:check`).
- Fórmula e pesos vivem em um único lugar documentado (código + este spec) — nunca duplicados.

## 7. Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Score virar "número mágico" que ninguém entende | Alta se mal implementado | Alta (perde toda a confiança) | AC-2/AC-3 obrigam evidência e confidence em todo assessment, sem exceção |
| Pesos default não fazerem sentido para todo tipo de projeto | Alta | Média | Pesos configuráveis por projeto desde o dia 1 (AC-1), não hardcoded |
| Cold start: projeto novo sem `Observation` histórica | Alta em projetos novos | Baixa (é esperado) | `confidence` reduzida é a resposta correta, não um erro ou bloqueio |

## 8. Métricas de sucesso

Rodar `risk:assess` sobre 5 mudanças históricas reais deste repositório (ex.: a extração do
`isPathWithinRoot`, a correção do policy approval bypass) produz scores que, em revisão humana,
ordenam corretamente do menos para o mais arriscado.
