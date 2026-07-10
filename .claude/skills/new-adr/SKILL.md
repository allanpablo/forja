---
name: new-adr
description: Cria um ADR numerado em memory/90-decisions/ a partir do _template.md, preenchendo contexto, decisão, alternativas e consequências.
disable-model-invocation: true
---

# Novo ADR

Registra uma decisão arquitetural em `memory/90-decisions/NNNN-titulo.md`.

Um ADR existe para preservar o **rationale**, não o resultado. O código já diz o que
foi feito; só o ADR diz por que as alternativas foram rejeitadas. Se não há alternativa
rejeitada, provavelmente não há decisão — e não há ADR a escrever.

## Quando usar

Toda mudança estrutural: novo comando no core, mudança de contrato entre agentes,
troca de armazenamento, nova convenção de memória. O subagent `governance` reprova
merge de mudança estrutural sem ADR.

## Passos

1. **Descobrir o próximo número.** Nunca reutilize nem adivinhe:

   ```bash
   ls memory/90-decisions/ | grep -E '^[0-9]{4}-' | sort | tail -1
   ```

   O próximo é esse + 1, com zero-padding em 4 dígitos.

2. **Verificar se já existe ADR sobre o tema.** Uma decisão que revisa outra não
   ganha ADR novo do zero — ela *supersedes* a anterior:

   ```bash
   npm run query:universal "<tema da decisão>"
   ```

   Se encontrar, o ADR novo declara `superseded by` no antigo e o antigo passa a
   `Status: superseded by ADR-NNNN`.

3. **Copiar o template** `memory/90-decisions/_template.md` para o novo caminho.
   O slug do arquivo é o título em kebab-case, sem artigos: `0021-guardrails-de-harness.md`.

4. **Preencher.** Regras que importam:
   - `Status`: `proposed` até haver merge; `accepted` depois.
   - `Contexto`: o problema e as restrições. Sem solução aqui.
   - `Decisão`: no imperativo, direto. "Adotar X", não "decidimos que talvez X".
   - `Alternativas consideradas`: no mínimo uma, com o motivo real da rejeição.
     "Rejeitada porque é pior" não é motivo.
   - `Consequências`: inclua os trade-offs negativos. Um ADR só com positivas mente.
   - `Rastreamento`: paths reais de implementação.

5. **Reindexar a memória**, senão o ADR fica invisível para `query:universal`:

   ```bash
   npm run sync:universal
   ```

6. **Referenciar de volta.** Se o ADR muda uma convenção descrita no `CLAUDE.md`
   ou no `AGENTS.md`, atualize esses arquivos no mesmo commit. Documentação que
   contradiz o ADR é pior que documentação ausente.
