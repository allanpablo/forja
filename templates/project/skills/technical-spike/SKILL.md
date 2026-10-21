---
name: technical-spike
description: Use quando uma incerteza técnica é cara demais para assumir às cegas: planeja uma prova de conceito com tempo limitado, uma pergunta, critérios de sucesso e uma decisão, e registra o resultado.
---

# Spike Técnico (Prova de Conceito)

Um spike é um experimento curto, com tempo limitado, que compra certeza antes de assumir algo caro. Seu produto é uma **decisão apoiada em evidência**, não código de produção.

Pagar alguns dias para descartar uma ideia ruim é um seguro contra gastar meses nela.

## Quando fazer

- Uma escolha técnica com alto custo de reversão que ninguém do time já fez (banco de dados novo, framework, integração, estilo de arquitetura).
- Uma dúvida de desempenho, escala ou viabilidade que a discussão não resolve.
- Várias opções concorrentes e o time continua debatendo em vez de decidir.

Não faça spike do que o time já sabe fazer. Faça.

## Regras

- **Uma pergunta por spike**, respondível com sim/não ou com a escolha entre opções.
- **Tempo fixo**: de 1–2 dias até uma semana no máximo. Quando acaba, o spike acaba, terminado ou não.
- **Critérios de sucesso e de fracasso definidos antes de começar.** Do contrário, o resultado é reinterpretado para caber no que foi construído.
- **Descartável por padrão**: um branch separado, nunca mesclado como está. O que for mantido é reescrito direito na linha principal, com testes.
- **Escopo mínimo**: só o necessário para responder à pergunta. Sem polimento de UI, sem tratamento de erro além do que a pergunta exige, sem generalização.
- **Evidência acima de impressão**: medições, um caminho funcionando, uma limitação reproduzida, código mostrando que a integração de fato funciona.
- **Um resultado inconclusivo é um resultado.** Registre o que se aprendeu e decida: descartar, ou fazer mais um spike com uma pergunta nova e mais estreita. Nunca estenda o tempo em silêncio.

## Processo

1. **Enquadre a pergunta.** O que exatamente precisa ser sabido para decidir? Que decisão depende disso?
2. **Defina os critérios.** Que resultado significa "adotar" e qual significa "descartar". Inclua limites mensuráveis quando fizer sentido (latência, vazão, memória, linhas de código de cola, tempo de setup).
3. **Defina o tempo e o escopo.** O que está dentro e o que está explicitamente fora.
4. **Execute.** Construa só o caminho crítico. Anote as surpresas na hora em que acontecem.
5. **Relate os achados** contra os critérios, com evidência.
6. **Decida**: adotar, descartar, ou um spike novo e mais estreito. Se adotado ou rejeitado e a decisão for relevante, registre-a como ADR (skill `architecture-decision-record`).

## Formato do plano

```
# Spike: <título curto>

- Pergunta: <a pergunta única>
- Decisão que destrava: <o que será decidido com a resposta>
- Tempo: <N dias, início–fim>
- Branch: spike/<slug>

## Hipótese
<O que esperamos encontrar.>

## Critérios de sucesso
- <condição mensurável ou observável>

## Critérios de fracasso
- <condição que significa descartar>

## Escopo
- Dentro: <...>
- Fora: <...>

## Riscos / suposições
- <...>
```

## Formato do relatório

```
# Resultado do spike: <título curto>

- Resultado: <Adotar | Descartar | Inconclusivo → novo spike>
- Tempo gasto: <real vs. previsto>

## Achados
- <achado> — evidência: <medição, link, reprodução>

## Contra os critérios
| Critério | Resultado | Atendido? |

## Surpresas
- <o que não era esperado>

## Recomendação
<O que fazer em seguida. Se for adotar: o que precisa ser reconstruído direito e para que o código do spike não deve ser reaproveitado.>

## ADR
<NNNN, ou "não necessário" e por quê>
```

## No Forja

No Forja, o plano e o resultado do spike ficam em `memory/40-delivery/spikes/<slug>.md`; a decisão, quando relevante, vira ADR em `memory/90-decisions/` (`architecture-decision-record`). Rode `forja sync:universal` depois.

## Evite

- Spikes sem pergunta ("vamos brincar com X").
- Critérios definidos depois de ver os resultados.
- Mesclar código de spike no branch principal.
- Estender o tempo em vez de reformular a pergunta.
- Generalizar ou polir dentro do spike.
- Fazer várias perguntas num spike e não responder nenhuma com clareza.
