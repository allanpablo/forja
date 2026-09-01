# Spec: Drift Sentinel — verificação contínua de que o verificado continua verdade

- **ID**: SPEC-030
- **Status**: draft
- **Owner**: apk
- **Criado em**: 2026-08-31
- **Sprint alvo**: <a definir>
- **ADRs relacionadas**: nenhuma ainda — nasce da auditoria de segurança de 2026-08-31, que corrigiu
  `packages/graph` para que `status: 'verified'` só venha de fontes de evidência confiáveis
  (`deterministic-extractor`, `sandbox.*`). Este spec é a continuação natural: **verified é um
  instantâneo, não uma garantia permanente.**

## 1. Problema

O GraphLoop agora distingue de verdade `verified` de `inferred`/`hypothesis` (a auditoria fechou o
buraco onde qualquer chamador podia se autodeclarar "verificado"). Mas isso resolve só metade do
problema: **um nó ou aresta `verified` continua marcado `verified` para sempre**, mesmo que o código
que o originou tenha mudado depois. `GraphIndexer.sync` já é idempotente por checksum de fonte
(`apply()` pula quando `sourceChecksum` não mudou) — ou seja, **o mecanismo para detectar "isso
mudou" já existe**. O que falta é: quando um documento muda, nada hoje sinaliza que as
arestas/evidências antigas derivadas dele podem estar obsoletas até a próxima reindexação, e nada
compara a nova extração contra a ADR/spec que descrevia o estado anterior. Uma ADR pode descrever uma
decisão que o código não implementa mais há três sprints, e nada no Forja aponta a divergência — ela
só aparece quando um humano tropeça nela.

## 2. Proposta de valor

Um novo comando, `forja drift:check`, reindexa (via `GraphIndexer.sync`, já existente) e classifica
cada documento em três estados: **inalterado**, **mudou e a extração continua consistente com as
relações registradas**, ou **mudou e uma relação antes `verified` não é mais reproduzível a partir do
conteúdo atual** — este último caso é o "drift" que importa: uma ADR, um `DEPENDS_ON`, um `IMPLEMENTS`
que já foi verdade e hoje não é mais, sem que nada tenha formalmente revogado essa relação.

## 3. User stories

- **Como** sdd-architect, **quero** saber quando uma ADR descreve algo que o código não faz mais,
  **para que** eu não continue arquitetando em cima de uma premissa que já morreu.
- **Como** governance, **quero** um relatório de "quantos documentos divergiram desde a última
  verificação", **para que** drift vire um item de rotina (tipo `gsd:check`), não uma surpresa.
- **Como** consultor com dezenas de projetos gerados pelo Forja, **quero** rodar `drift:check` em lote
  antes de retomar um projeto que não toco há meses, **para que** eu recupere contexto real em vez de
  confiar cegamente em specs/ADRs antigas.

## 4. Critérios de aceite (Definition of Done)

- [ ] AC-1: `forja drift:check [--domain <d>]` roda `GraphIndexer.sync` e, para cada `GraphMutation`
      cujo `sourceChecksum` mudou desde a última indexação, compara as arestas que o documento
      produzia **antes** com as que produz **agora**.
- [ ] AC-2: uma aresta que existia com `status: 'verified'` e não é mais produzida pela extração atual
      do mesmo `sourceKey` é marcada `stale` (reaproveitando `validTo` — GraphLoop já suporta validade
      temporal — em vez de inventar um estado novo em `KnowledgeStatus`, que é um contrato versionado
      e não deve crescer sem necessidade real).
- [ ] AC-3: o comando imprime um relatório: N documentos verificados, M sem mudança, K com drift
      detectado (lista de `sourceKey` + quais relações ficaram `stale`).
- [ ] AC-4: `drift:check` é determinístico e não usa LLM — é extração + diff, igual ao
      `extractDeterministicRelations` que já existe. Nenhuma dependência nova de rede ou modelo.
- [ ] AC-5: `gsd:check`/`check:all` ganham um modo opcional (`--with-drift`, não obrigatório por
      padrão) que inclui `drift:check` na bateria — opcional porque rodar em todo commit seria caro
      demais para repos grandes; ver NFRs.

## 5. Escopo

**Dentro**:
- Comando `drift:check`, reaproveitando `GraphIndexer`/`GraphLoop`/`extractDeterministicRelations`
  como estão (nenhuma mudança de contrato nesses três é necessária além de expor o "antes vs. depois"
  que `apply()` já computa internamente e hoje descarta).
- Marcação de arestas obsoletas via `validTo` (mecanismo já existente).
- Relatório CLI.

**Fora** (explícito, evita scope creep):
- **Corrigir automaticamente** o código ou a ADR — o comando só sinaliza; decidir qual lado (código ou
  documento) está desatualizado é julgamento humano ou de agente, não deste comando.
- Rodar em CI/pre-commit por padrão — fica opt-in (ver AC-5) até haver medição de custo em repos
  grandes.
- Drift semântico ("a ADR ainda é logicamente verdadeira mas o código foi refatorado") — este spec
  cobre só drift **estrutural**, detectável pelo mesmo extrator determinístico que já indexa o grafo.

## 6. NFRs / restrições

- **Performance**: `drift:check` não pode ser mais caro que rodar `code:index` duas vezes (é
  essencialmente isso) — sem chamada de LLM, custo é I/O + regex, já provado barato pelo indexador
  existente.
- **Falso positivo em refactors cosméticos**: renomear uma variável sem mudar a relação semântica não
  deve gerar drift — mitigado porque o extrator já trabalha por relação (`DEPENDS_ON`, `CALLS`,
  `IMPLEMENTS`...), não por hash de linha inteira; um rename que preserva a relação preserva a aresta.
- **Determinismo antes de LLM** (princípio já declarado na visão do Forja 2.0): este comando não
  introduz nenhuma dependência de modelo.

## 7. Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Ruído: muito drift cosmético reportado, comando vira "grito de lobo" | Média | Alta (ninguém mais lê o relatório) | Escopo restrito a relações semânticas, não hash de conteúdo bruto (ver NFR acima); medir taxa de falso positivo no dogfooding antes do GO |
| Confundir `stale` com `contradicted` (que já existe e significa outra coisa — conflito ativo) | Baixa | Média | AC-2 usa `validTo`, não reaproveita `contradicted`; documentar a diferença explicitamente no plan |
| Escopo crescer para "corrigir automaticamente" | Média | Alta (autonomia não supervisionada mexendo em ADR) | Fora de escopo explícito (§5); qualquer autocorreção é uma spec futura, com gate de aprovação próprio |

## 8. Métricas de sucesso

30 dias após o release: rodar `drift:check` num projeto real e ativo (não um fixture) resulta em pelo
menos um drift genuíno encontrado que um humano confirma como real (não falso positivo) — provando que
o sinal vale o custo de rodar.
