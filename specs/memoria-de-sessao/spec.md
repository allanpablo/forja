# Spec: memoria-de-sessao

- **ID**: SPEC-052
- **Status**: done
- **Owner**: apk
- **Criado em**: 2026-10-21
- **Sprint alvo**: 5.2
- **ADRs relacionadas**: [ADR-0086](../../memory/90-decisions/0086-projeto-conectado-e-jornada-como-gate.md) (projeto conectado), ADR-0091 (esta feature)

## 1. Problema
O que acontece numa sessão de IA só fica no transcript, que o Forja não lê. Quando o contexto é
compactado, a IA perde o fio (quais arquivos mexeu, qual spec estava seguindo, o que já commitou), e a
sessão seguinte começa do zero: o briefing do SessionStart mostra specs e handoffs, mas nada sobre o
que foi feito por último. Medição hoje: 0 registros de sessão em `memory/` de qualquer projeto.

## 2. Proposta de valor
Toda sessão do Claude Code que muda alguma coisa deixa um checkpoint determinístico na memória do
projeto, atualizado ao fim de cada turno e antes de cada compactação. Depois de compactar, a IA recebe
o checkpoint de volta; numa sessão nova, vê onde a anterior parou. Sem chamar LLM, sem custo.

## 3. User stories
- **Como** dev numa sessão longa, **quero** que a IA, depois da compactação, saiba quais arquivos já
  editou e qual spec estava seguindo, **para que** ela não refaça nem contradiga o trabalho.
- **Como** dev abrindo uma sessão nova, **quero** ver onde a última parou, **para que** eu retome sem reler o histórico.
- **Como** dono do projeto, **quero** que nenhum texto de prompt ou comando inteiro vá para a memória
  commitada, **para que** um segredo colado no chat não acabe no git.

## 4. Critérios de aceite (Definition of Done)
- [x] AC-1: `forja hook:session-memory` lê o JSON do hook (stdin: `session_id`, `transcript_path`, `cwd`, `hook_event_name`) e grava `memory/60-runs/sessions/<AAAA-MM-DD>-<id8>.md` com: título da sessão (`ai-title`), branch, arquivos editados (Edit/Write/MultiEdit/NotebookEdit, relativos ao projeto), comandos `forja <cmd>` (só o nome), specs tocadas (citadas em caminhos editados ou em comandos `forja spec:*`) e assuntos de `git commit -m`.
- [x] AC-2: sessão sem edição, sem comando forja e sem commit não grava nada; o mesmo `session_id` reescreve o mesmo arquivo (idempotente); o arquivo não contém texto de prompt.
- [x] AC-3: o hook nunca derruba a sessão: transcript ausente, JSON inválido ou projeto sem `memory/` saem com 0 e sem saída.
- [x] AC-4: `project:wire` registra o hook nos eventos `Stop` e `PreCompact` do `.claude/settings.json`, e `project:wire --check` (check `claude-hooks`) falha se faltar algum dos quatro eventos.
- [x] AC-5: `hook:session-start` lê o `source` do stdin: em `compact` injeta o checkpoint da própria sessão; em `startup`/`resume` injeta uma linha com a última sessão registrada (data, título, nº de arquivos, specs).
- [x] AC-6: a jornada (`lib/core/journey.ts`) cobre o caminho: transcript sintético → checkpoint gravado → SessionStart `compact` o devolve.

## 5. Requisitos não-funcionais
- **Performance**: transcript de 10 MB processado em < 1 s (linhas sem `tool_use`/`ai-title` são descartadas antes do `JSON.parse`); timeout do hook 10 s.
- **Segurança/LGPD**: sem texto de prompt, sem argumentos de comando além do nome do subcomando `forja`, sem saída de ferramenta.
- **Observabilidade**: não audita (hooks já são excluídos da trilha, `bin/forja.ts`).

## 6. Fora de escopo
- Resumo por LLM da sessão (custo; pode vir depois, alimentado por este checkpoint).
- Gate de "pronto" no Stop (bloquear o fim do turno com testes vermelhos).
- Codex/Gemini/Copilot: não têm eventos equivalentes de fim de turno e compactação com transcript em disco.

## 7. Riscos e dependências
- Formato do transcript do Claude Code não é contrato público: o parser ignora o que não reconhece e degrada para "nada a gravar".
- Checkpoints entram no git do projeto como o resto de `memory/`; quem não quiser ignora `memory/60-runs/sessions/`.
