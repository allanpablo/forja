# Spec: code-context

- **ID**: SPEC-016
- **Status**: done
- **Owner**: apk
- **ADRs relacionadas**: ADR-0009 (economia de token), ADR-0003 (smart-context), ADR-0020 (core/registry)

## 1. Problema

O `token:economy` mediu a economia real do framework: o `context.md` de um domínio (o mapa) faz o
contexto mínimo custar **−61%** vs varrer a fatia no frio. Mas essa economia era **potencial, não
entregue**: o mapa é só um arquivo que alguém precisa lembrar de ler, e ainda montar o contexto na
mão (mapa + os arquivos certos). A economia medida não vira lever até virar comando.

## 2. Proposta de valor

Um comando entrega o **pacote de contexto mínimo** de um domínio, pronto para colar, com o custo em
token à mostra: o −61% deixa de ser medição e vira ferramenta do dia a dia.

## 3. User stories

- **Como** agente que vai mexer num domínio, **quero** um comando que me dê o mapa + (sob demanda) o
  código da fatia, **para que** eu não pague o custo de explorar a árvore no frio.
- **Como** dev, **quero** ver o custo em token do pacote, **para que** a economia seja visível e eu
  escolha entre "só o mapa" e "mapa + código".

## 4. Critérios de aceite (Definition of Done)

- [x] AC-1: `forja code:context <domínio>` imprime o `context.md` do domínio (o mapa), pronto para
      colar, com os tokens do mapa no rodapé.
- [x] AC-2: `--code` anexa os `.ts` da fatia (`backend/src/modules/<domínio>/`) e soma os tokens.
- [x] AC-3: `--project <path>` aponta para outro projeto (default: `cwd`). Sem domínio, lista os
      disponíveis; domínio inexistente reprova com a lista.
- [x] AC-4: A lógica de montagem é pura e testável (`lib/code-context.ts`), com fixtures — sem tocar
      o disco real.

## 5. Escopo

**Dentro**: o mapa + o código da fatia, com custo em token. Composição com `code:impact` (blast
radius) documentada, não embutida.

**Fora** (explícito):
- Reindexar/consultar a memória via FTS5 — isso é `context:smart`/`query:universal`; este comando lê
  o mapa direto do disco do projeto.
- Chamar codegraph internamente — o blast radius fica em `code:impact`, componível (`&&`).
- Editar ou resumir o código — entrega cru; resumir é decisão do agente que consome.

## 6. NFRs / restrições

- **Compatibilidade**: comando novo; não muda nada existente.
- **Sem dependência de rede ou de codegraph** no caminho principal (mapa + código são leitura de disco).

## 7. Métricas de sucesso

O pacote "só o mapa" de um domínio típico custa uma fração do "mapa + código" — e ambos, uma fração
de ler a fatia no frio. O `token:economy` já mostra o −61%; este comando o torna acionável.
