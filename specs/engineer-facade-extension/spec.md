# Spec: `forja engineer` — compor recomendação de agente + incidentes parecidos

- **ID**: SPEC-042
- **Status**: done
- **Owner**: apk
- **Criado em**: 2026-09-01
- **Sprint alvo**: Sprint 10 (extensão de composição — todos os Sprints 4-9 da Fase 3-6 já entregam
  sinais que `forja engineer`, de SPEC-035/Sprint 3, ainda não compõe)
- **ADRs relacionadas**: ADR-0078; depende de SPEC-035 (`forja engineer`), SPEC-037
  (`recommendAgent`), SPEC-041 (`incident:similar`) — todos reaproveitados sem mudança

> `forja engineer` (SPEC-035) foi implementada no Sprint 3, antes de `recommendAgent` (SPEC-037,
> Sprint 5) e `incident:similar` (SPEC-041, Sprint 9) existirem. AC-2 de SPEC-035 já definia a
> façade como composição extensível ("nenhuma lógica de negócio nova... qualquer decisão real
> continua nos engines que ela chama") — esta spec é literalmente isso: compor dois sinais que já
> existem e que a proposta de valor original de `forja engineer` (SPEC-031 §2: "uma única pergunta
> que já traga arquitetura, risco, ADRs relevantes e fluxo recomendado") já pedia implicitamente,
> mas que não existiam ainda no Sprint 3.

## 1. Problema

`forja engineer "<objetivo>"` já compõe contexto, ADRs relevantes, `architecture:check` e risco —
mas não sugere qual agente registrado é mais adequado pro objetivo, nem mostra incidentes passados
parecidos, mesmo essas duas capacidades já existindo (`agent:recommend`, `incident:similar`) e
sendo exatamente o tipo de sinal que orienta o início de um trabalho.

## 2. Proposta de valor

`forja engineer "<objetivo>" [--role <role>]` passa a incluir, quando aplicável: ranking de agentes
registrados adequados ao `--role` informado (reaproveita `recommendAgent`, SPEC-037), e incidentes
passados parecidos com o objetivo (reaproveita a busca por palavra-chave de `incident:similar`,
SPEC-041) — sem nenhuma lógica nova, só mais composição, exatamente como AC-4 de SPEC-035 já exigia.

## 3. User stories

- **Como** desenvolvedor/orquestrador, **quero** que `forja engineer` já sugira quem trabalhar e o
  que já aconteceu de parecido, **para que** eu não precise rodar `agent:recommend`/
  `incident:similar` manualmente depois de já ter rodado `engineer`.

## 4. Critérios de aceite (Definition of Done)

- [x] AC-1: `forja engineer "<objetivo>" --role <role>` inclui uma seção de agentes recomendados
      (reaproveita `recommendAgent`, SPEC-037, sem reimplementar a fórmula de scoring). Sem
      `--role`, a seção não aparece — nunca inventa um papel que o usuário não informou.
- [x] AC-2: `forja engineer "<objetivo>"` sempre inclui uma seção de incidentes parecidos
      (reaproveita o matching por palavra-chave de `incident:similar`, SPEC-041, exportado do
      mesmo módulo — sem duplicar a lógica de scoring). Vazio quando não há incidente parecido, não
      erro.
- [x] AC-3: nenhuma lógica nova além de composição/formatação (mesmo princípio de AC-4 de
      SPEC-035) — `recommendAgent`/o matching de incidentes continuam sendo a única fonte de
      verdade de cada score.
- [x] AC-4: `--json` inclui as duas seções novas estruturadas; texto legível mostra as duas.

## 5. Escopo

**Dentro**: extensão aditiva de `scripts/engineer.ts` + mover o matching de incidentes de
`scripts/incident.ts` pra `lib/core/incident-search.ts` (mesmo padrão de `risk-collect.ts`) pra
reaproveitamento sem duplicar.

**Fora**: incluir `detectAnomaly` (SPEC-040) na composição — não se encaixa na mesma pergunta
("por onde eu começo") que `forja engineer` responde; anomalia é sobre comportamento contínuo de UM
agente já em operação, não sobre iniciar um objetivo novo (nota já registrada em ADR-0079). Fica de
fora por não ser a mesma pergunta, não por limitação técnica.

## 6. NFRs / restrições

- Zero lógica de scoring nova — só import + composição.
- Zero migration/persistência nova.

## 7. Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| `forja engineer` virar um monólito de composição frágil (toda spec futura quer adicionar uma seção) | Média a longo prazo | Baixa agora (só mais 2 seções) | Mesmo padrão de AC-4/AC-3 de SPEC-035 continua valendo — cada seção nova precisa ser genuinamente "por onde eu começo", não qualquer sinal disponível (ver §5 "Fora" sobre anomalia) |

## 8. Métricas de sucesso

Rodar `forja engineer` com `--role` sobre os agentes já registrados nos testes de SPEC-037, e sobre
os incidentes já registrados nos testes de SPEC-041 (reaproveitados como fixture), e confirmar que
as duas seções aparecem corretamente — revisão humana, mesma metodologia das specs anteriores.

**Validado** (`test/engineer-cli.test.js`): agente + incidente reais de fixtures das specs
anteriores; `engineer --role developer` mostrou a recomendação certa; `engineer "npm hangs..."`
achou o incidente correspondente e ignorou o não relacionado; sem `--role`, a seção de agentes
corretamente não aparece; sem nenhum incidente registrado, seção vazia sem erro.

**Achados reais corrigidos durante a implementação (não adiados)**:

1. **Importar de `scripts/incident.ts` executaria seu `main()` como efeito colateral** (todo
   `scripts/*.ts` roda incondicionalmente ao ser importado, mesmo padrão que motivou
   `lib/core/risk-collect.ts` em SPEC-034/038) — capturado no design antes de qualquer código ser
   escrito, corrigido movendo `rankIncidentsByQuery`/`incidentRecords`/`titleOf` pra
   `lib/core/incident-search.ts` (D3 do plan, revisão de D1/D2 originais).
2. **Bug de parsing de argumentos**: a primeira versão do parser de `--role` computava
   `roleIndex + 1` incondicionalmente (0 quando `roleIndex === -1`), engolindo o próprio objetivo
   sempre que `--role` não era passado — reproduzido imediatamente ao testar manualmente
   (`forja engineer "<objetivo>"` sem flags devolvia "Uso: ..."). Corrigido: cada índice só entra
   no conjunto de "consumidos" quando a flag correspondente foi de fato encontrada.
