---
name: architecture-decision-record
description: Use quando uma decisão técnica precisa ser registrada ou revisitada: escreve um Registro de Decisão de Arquitetura curto, com contexto, decisão, alternativas, consequências e reversibilidade.
---

# Registro de Decisão de Arquitetura (ADR)

Registra uma decisão técnica relevante e, acima de tudo, **por que** ela foi tomada, para que qualquer pessoa (inclusive o autor, meses depois) consiga entendê-la sem reconstruir a discussão.

Um ADR é curto. Se precisa de mais de uma página, provavelmente é mais de uma decisão.

## Quando escrever

Escreva um ADR quando a decisão:
- for cara de reverter (banco de dados, linguagem, framework, modelo de implantação, fronteiras do modelo de dados);
- afetar mais de um módulo, contexto ou time;
- não for óbvia, a ponto de alguém depois perguntar "por que fizemos assim?";
- for o resultado de uma prova de conceito (spike).

Não escreva ADRs para escolhas rotineiras que qualquer pessoa do time faria do mesmo jeito.

## Regras

- **Uma decisão por ADR.**
- **Imutável depois de aceito.** Não edite a decisão; escreva um ADR novo que o substitua e atualize só o status do antigo.
- **Escrito no repositório**, junto ao código, numerado em sequência e nunca renumerado. Use a pasta que o projeto já usa (`docs/adr/NNNN-slug-curto.md` quando não houver uma).
- **O contexto enuncia forças, não opiniões**: requisitos, restrições, prazos, habilidades do time, evidência de spikes ou de produção.
- **As alternativas são reais.** Cada uma traz o motivo de ter perdido. Uma decisão sem alternativas consideradas é um anúncio, não uma decisão.
- **As consequências incluem as ruins.** Toda decisão tem custos; nomeá-los é o que torna o registro confiável.
- **Declare a reversibilidade e um gatilho de revisão**: o que faria valer a pena revisitar esta decisão.
- Se um fato é desconhecido, escreva-o como suposição. Não invente evidência.

## Status

`Proposed` → `Accepted` → (`Deprecated` | `Superseded by NNNN`)

`Rejected` também é válido: registrar a decisão de não fazer algo impede que a mesma discussão recomece.

## Modelo

```
# NNNN. <Decisão como uma frase curta no imperativo>

- Status: <Proposed | Accepted | Rejected | Deprecated | Superseded by NNNN>
- Data: <AAAA-MM-DD>
- Decisores: <nomes ou papéis>
- Relacionados: <ADRs, spikes, issues>

## Contexto
<O problema e as forças em jogo. Restrições, requisitos, evidência. Ainda sem solução.>

## Decisão
<O que foi decidido, de forma direta. "Vamos ...">

## Alternativas consideradas
- <Alternativa> — <por que não foi escolhida>

## Consequências
- Positivas: <...>
- Negativas: <...>
- Neutras / desdobramentos: <trabalho que isso cria, riscos a acompanhar>

## Reversibilidade
<Barata | Custosa | Sem volta>. <O que reverter envolveria.>

## Gatilho de revisão
<Condição que deve levar a revisitar esta decisão, por exemplo volume acima de X, crescimento do time, uma dependência chegando ao fim do suporte.>
```

## Processo

1. Confirme que a decisão merece um ADR (veja "Quando escrever").
2. Reúna o contexto da conversa, do código e de resultados de spikes. Liste os fatos faltantes como suposições.
3. Escreva a decisão em uma ou duas frases antes de qualquer outra coisa; se não couber nisso, divida.
4. Preencha alternativas e consequências, depois reversibilidade e gatilho de revisão.
5. Se ele substitui um ADR anterior, marque o antigo como `Superseded by NNNN`.

## No Forja

No Forja, os ADRs ficam em `memory/90-decisions/NNNN-slug.md`, a partir de `memory/90-decisions/_template.md` (cabeçalho `- **Status**:`, `- **Data**:`, `- **Autor(es)**:`, `- **Tags**:`). Use os status do template do projeto (`proposed`, `accepted`, `superseded by ADR-NNNN`, `deprecated`) e mantenha **Reversibilidade** e **Gatilho de revisão** como seções ao final.

- Próximo número e status: `forja adr:list`; detalhe de um ADR: `forja adr:show <id>`.
- Depois de gravar: `forja sync:universal`, para o ADR entrar na memória consultável.
- Mudança estrutural sem ADR é reprovada pelo papel governance.

## Evite

- Escrever o ADR como documento de design ou tutorial.
- Um contexto que defende a decisão em vez de descrever a situação.
- Esconder consequências negativas.
- Editar um ADR aceito para mudar a decisão.
- Registrar decisões que ninguém nunca vai questionar.
