# Spec: Change Risk Engine

- **ID**: SPEC-034
- **Status**: done
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

- [x] AC-1: `RiskEngine.assess(input): ChangeRiskAssessment` (interface pura, sem I/O) implementa a
      fórmula documentada em `docs/architecture/FORJA-3-ENGINEERING-INTELLIGENCE-ARCHITECTURE.md`
      §9, com os 7 fatores nomeados e pesos default configuráveis.
- [x] AC-2: cada fator do assessment carrega `evidenceIds` (nós/arestas do grafo, `Observation`s
      históricas) — nenhum score sem rastro de onde veio.
- [x] AC-3: `confidence` do assessment reflete a fração de fatores com dado real disponível — um
      projeto sem histórico de falha ainda produz um score, mas com confiança visivelmente menor,
      nunca escondida.
- [x] AC-4: `forja risk:assess [ref]` (CLI, ver D1 do plan — ref de git, não prosa livre) e
      `forja risk:explain <assessment-id>` funcionais.
- [x] AC-5: interface `RiskAssessor`/`RiskEngine` pequena e opcional — `packages/policy` nunca
      importa `packages/engineering/risk`; `PolicyRequest.riskScore` é um `number` puro (D3 do
      plan), não o assessment inteiro.
- [x] AC-6: faixas de autonomia (0-25 autonomous / 26-50 autonomous_with_review / 51-75 supervised
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

**Validado**: `risk:assess <ref>` rodado contra 5 commits reais deste repositório (grafo real,
`.context/architecture/constitution.json` real, sem fixture):

| Commit | Descrição | Score |
|---|---|---|
| `6f220ed` | refatoração: extrai runner de capability sandboxed reutilizável | 7 |
| `a950711` | fix de segurança pontual (1 arquivo): argument-injection em `code:impact` | 11 |
| `1a49682` | docs: remove citação de comando ainda não implementado | 13 |
| `fdab8e3` | feature nova: `drift:check` (SPEC-030) | 13 |
| `f678d37` | fix de segurança multi-arquivo: auth do proxy do dashboard, DB shutdown handler | 19 |

Ordem (revisão humana, apk): o fix de segurança multi-arquivo fica corretamente no topo; a
refatoração autocontida (menor blast radius, nada ainda depende do novo helper) fica corretamente
no fundo. Ordem aceita — sem redesenho de pesos necessário (kill criteria do apêndice de
`specs/engineering-intelligence/spec.md` não disparado).

**Achado real (limitação documentada, não corrigida — heurística determinística, não regressão de
AC)**: `security_sensitivity` não pegou `f678d37` como sensível, apesar de o commit mexer em
autenticação (`apps/dashboard/app/api/forja/guard.ts`) e desligamento de banco
(`apps/server/src/main.ts`). A heurística de `scripts/risk.ts` (`inferSensitiveCategories`) casa só
substring de path (`secret|credential|\.env`, `adapter-sqlite|migration|database`,
`deploy|\.github/workflows|Dockerfile`) — nenhum desses arquivos tem esses termos no caminho, então
o fator não disparou. É determinístico (cumpre a NFR de "nenhum fator depende de LLM") mas tem
recall baixo para segurança que não está em path óbvio. Não corrigido aqui: exigiria uma heurística
mais rica (ex.: casar contra `PolicyCategory` já inferida do `capabilityId`/handler tocado, não só
o path do arquivo) — candidato a uma spec própria de refinamento, fora do escopo desta fundação.

**Melhoria posterior (não a correção estrutural completa, uma redução da superfície mais óbvia de
falso-negativo)**: `SENSITIVE_PATTERNS` (`lib/core/risk-collect.ts`, movida de `scripts/risk.ts` no
Sprint 6) ganhou `auth|guard|session|token` na categoria `secrets` e `shutdown` na categoria
`database` — termos adjacentes a controle de acesso/ciclo de vida de credencial e conexão que a
lista original não cobria. Revalidado contra o mesmo `f678d37`: `security_sensitivity` agora
detecta `secrets, database` (antes: nenhuma), score final `19/100 → 29/100`, banda de autonomia
`autonomous → autonomous_with_review` — mais correto pro que o commit de fato fez. **A limitação
estrutural continua real**: qualquer lista fixa de palavras-chave tem recall limitado por natureza;
a correção estrutural sugerida na nota original (casar contra `PolicyCategory` inferida do
handler/capability tocado) segue não implementada e fora do escopo desta fundação.
