# ADR-0091: Memória de sessão por hooks (Stop, PreCompact, SessionStart)

- **Status**: accepted
- **Data**: 2026-10-21
- **Autor(es)**: Allan Pablo / Claude
- **Tags**: hooks, memory, claude-code

## Contexto

O projeto conectado (ADR-0086) injeta contexto na entrada da sessão e do prompt, mas nada sai da sessão
para a memória. Na compactação a IA perde quais arquivos editou e qual spec seguia; a sessão seguinte
não sabe onde a anterior parou. O Claude Code expõe os eventos `Stop` (fim de cada turno), `PreCompact`
(antes de compactar) e `SessionStart` com `source` (`startup`, `resume`, `clear`, `compact`), todos com
o caminho do transcript JSONL.

## Decisão

1. **Um checkpoint determinístico por sessão** em `memory/60-runs/sessions/<data>-<id8>.md`, reescrito
   por `forja hook:session-memory` no `Stop` e no `PreCompact`. Extraído do transcript sem LLM: título
   da sessão, branch, arquivos editados, comandos `forja`, specs tocadas, assuntos de commit.
2. **Nada de texto livre**: prompts, comandos inteiros e saídas de ferramenta não entram. A memória é
   commitada; um segredo colado no chat não pode ir parar no git.
3. **O SessionStart fecha o ciclo**: em `compact` devolve o checkpoint da própria sessão; em
   `startup`/`resume`, uma linha sobre a última sessão.
4. **Só grava quando houve trabalho** (edição, comando forja ou commit), para a pasta não virar log de conversa.

## Alternativas consideradas

- **Resumo por LLM no PreCompact.** Rejeitada por ora: custa a cada compactação e o hook tem timeout
  curto. O checkpoint determinístico pode alimentar um resumo depois.
- **Gravar no SQLite em vez de Markdown.** Rejeitada: `memory/` em Markdown já é indexado pelo
  `sync:universal` e legível por qualquer IA; o banco é projeção.
- **Guardar os prompts (truncados).** Rejeitada pelo risco de segredo no git; o título gerado pelo
  Claude Code descreve o assunto sem copiar o texto.

## Consequências

- Projetos conectados ganham dois hooks; `project:upgrade --apply` os adiciona a projetos existentes.
- O parser depende de um formato de transcript que não é contrato público: o que não reconhece é ignorado.
- Só o Claude Code se beneficia; as outras IAs seguem com o briefing do AGENTS.md.
