---
name: prompt-spec
description: Use quando passar trabalho de implementação para um agente de IA de código: transforma uma história ou requisito em prompts diretivos, prontos para colar, separados para backend e frontend, que exigem que o agente analise o código existente antes de mudar qualquer coisa e definem escopo, restrições e critérios de pronto.
---

# Especificação de Prompt

Um agente de código faz o que o prompt torna fácil. Um prompt vago recebe uma implementação plausível que ignora os padrões do código, adiciona dependências e mexe em arquivos não relacionados. Um prompt diretivo declara o objetivo, obriga o agente a aprender o código antes, cerca o escopo e define "pronto" como comandos que passam.

A saída padrão é **um prompt por lado (backend, frontend), pronto para colar**, mais a ordem de execução. Esta skill escreve prompts; não executa o agente.

## Convenções

- Entradas: uma história com critérios de aceite de `backlog-slicing`; o contrato de `api-design`; o modelo de `domain-modeling`; o próprio repositório (leia o README, o CLAUDE.md/AGENTS.md e a estrutura antes de escrever).
- Idioma do prompt: o do usuário, a menos que a documentação do código e os arquivos de agente estejam em outro.
- Frases imperativas e específicas. Sem gentilezas de enchimento, sem texto motivacional.
- Referencie caminhos, tipos e comandos reais do repositório. Leia-os antes; nunca invente um arquivo ou script.
- Um prompt = uma história ou fatia. Um prompt que precisa de "e também…" são dois prompts.

## Por que separar backend e frontend

Eles têm bases de código ou pastas, convenções, testes e revisores diferentes. O **contrato da API é a costura**: o prompt de backend o implementa, o prompt de frontend o consome. Os dois citam o mesmo contrato, então podem rodar em paralelo ou em sequência sem divergir. Rode o backend primeiro quando o contrato é novo; em paralelo quando ele já existe.

## Estrutura do prompt

Todo prompt tem estas seções, nesta ordem:

1. **Objetivo**: uma ou duas frases, o resultado visível ao usuário. Referencie o ID da história.
2. **Passo 0, analisar antes de implementar** (obrigatório): liste o que ler e o que relatar **antes de escrever código**:
   - os arquivos e módulos que tratam de funcionalidades parecidas (nomeie-os);
   - os padrões a copiar (tratamento de erro, validação, testes, nomes);
   - os arquivos de agente (CLAUDE.md, AGENTS.md) e as configurações dos linters;
   - um plano curto: arquivos a criar ou alterar, e por quê.
   Instrua o agente a parar depois do relatório se algo contradisser o prompt.
3. **Contexto**: as regras do domínio (`RN-NN`), o contrato (especificação do endpoint ou tipos), os ADRs relevantes. Cite-os; não parafraseie regras.
4. **Requisitos**: os critérios de aceite em Dado/Quando/Então, literalmente.
5. **Restrições**:
   - seguir as convenções encontradas no passo 0;
   - nenhuma dependência nova sem perguntar;
   - os testes vão junto com a mudança (conforme `testing` / `ts-testing`);
   - nada de refatorações, renomeações ou formatação não relacionadas;
   - nenhuma mudança no contrato (o outro lado depende dele).
6. **Fora do escopo**: o que não fazer, explicitamente (o outro lado, histórias futuras, migrações que são de outra pessoa).
7. **Pronto quando**: comandos que precisam passar (`tsc --noEmit`, `npm test`, linters, build, como o repositório os define), e os critérios de aceite demonstrados.
8. **Pare e pergunte se**: o contrato for impossível como escrito, uma regra for ambígua, a mudança precisar de uma migração ou de uma dependência nova, ou o passo 0 encontrar uma implementação existente.
9. **Entregue**: um resumo dos arquivos alterados, como foi testado e uma mensagem de commit proposta (`commit-message`).

## Formato

````
## Ordem de execução
<backend → frontend | paralelo>, porque <motivo>

## Prompt de backend
```text
<seções 1–9>
```

## Prompt de frontend
```text
<seções 1–9>
```
````

Omita um lado quando a história só mexe no outro, e diga isso.

## Próximo

- Depois que o agente rodar: `ts-code-review` (ou a revisão da linguagem), depois `commit-message` e `pull-request`.
- Se o passo 0 revelar uma questão de design: `architecture-decision-record` ou `technical-spike` antes de continuar.

## No Forja

No Forja, além de colar o prompt, registre a entrega como handoff (ADR-0005), com os 7 campos: `forja hermes:handoff '<json>'`, mapeando *context* ← Contexto, *acceptance* ← Requisitos + Pronto quando, *constraints* ← Restrições + Fora do escopo, *return* ← Entregue. Quem recebe lista os seus com `forja agent:route list --open --mine` e fecha com `forja agent:route done <id>`.

## Evite

- "Implemente a funcionalidade X" sem contexto.
- Pular o passo 0, ou deixar o agente codificar antes de relatar a análise.
- Um prompt só para backend e frontend juntos.
- Caminhos, scripts ou tipos que não existem no repositório.
- Deixar o agente mudar o contrato ou adicionar dependências em silêncio.
- "Pronto" sem comandos que o provem.
