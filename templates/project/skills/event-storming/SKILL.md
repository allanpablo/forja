---
name: event-storming
description: Use quando um domínio ainda não está claro antes de modelá-lo: conduz uma sessão de Event Storming com o usuário como especialista do domínio, descobrindo eventos de domínio, comandos, atores, políticas, modelos de leitura e pontos críticos, e propõe agregados e fronteiras de contexto candidatos.
---

# Event Storming

Descobre como um negócio funciona contando a sua história como uma sequência de fatos que aconteceram. Eventos são mais fáceis de enunciar para os especialistas do domínio do que entidades ou tabelas, e as lacunas entre eles revelam as regras que ninguém escreveu.

O usuário é o especialista do domínio. Pergunte, não suponha. A saída é uma **linha do tempo de eventos estruturada**, não um modelo; os agregados vêm por último e são só candidatos.

## Convenções

- Termos de modelagem em pt-BR seguidos do en-US, como em `domain-modeling`: Evento de Domínio (Domain Event), Comando (Command), Ator (Actor), Política (Policy), Modelo de Leitura (Read Model), Sistema Externo (External System), Ponto Crítico (Hotspot), Agregado (Aggregate).
- Nomes na linguagem ubíqua do usuário. Eventos no passado ("Pedido Confirmado", "Order Confirmed"); comandos no imperativo ("Confirmar Pedido", "Confirm Order").
- Entradas: achados brutos de `requirements-elicitation`, documentos ou as próprias palavras do usuário.
- Tudo o que o usuário não confirmou é um **ponto crítico**, nunca um fato.

## Níveis

| Nível | Pergunta | Use quando |
|---|---|---|
| Visão geral (big picture) | O que acontece no fluxo inteiro do negócio? | Iniciar um produto ou uma área grande; encontrar fronteiras de contexto |
| Processo | Como este processo funciona, regra a regra? | Desenhar uma funcionalidade ou um caso de uso |
| Design | Qual agregado aceita cada comando e garante qual regra? | Logo antes de `domain-modeling` |

Diga qual nível você está conduzindo. Não pule para o nível de design antes de a linha do tempo estar estável.

## Processo

Conduza em rodadas de perguntas com o usuário. Mostre a linha do tempo após cada rodada.

### 1. Exploração caótica
Peça todos os eventos que o usuário conseguir lembrar no escopo, em qualquer ordem. Estimule com: "O que acontece antes disso?", "O que acontece depois?", "O que pode dar errado?", "O que acontece no fim do dia / do mês?". Colete, não julgue.

### 2. Impor a linha do tempo
Ordene os eventos no tempo. Funda duplicados; separe eventos que escondem dois fatos. Marque os eventos pivô, onde o fluxo muda de fase ou de dono (por exemplo, "Pagamento Capturado"). Eles costumam marcar fronteiras de contexto.

### 3. Comandos e atores
Para cada evento: quem ou o que o causou? Um comando emitido por um **ator** (pessoa/papel), um **sistema externo**, uma **política** ou o tempo ("Fim do Mês Atingido").

### 4. Políticas
Reações que ligam eventos a comandos: "Sempre que <evento>, então <comando>". Pergunte se cada uma é automática, manual ou condicional. As políticas são onde moram as regras de negócio escondidas.

### 5. Modelos de leitura
De que informação o ator precisa para decidir emitir o comando? Esses são os modelos de leitura (telas, relatórios, consultas).

### 6. Pontos críticos
Marque cada conflito, incógnita, discordância, exceção ou dor. Cada um vira uma pergunta para o usuário ou um candidato a `RN-NN` para `requirements-gathering`.

### 7. Agregados e fronteiras candidatos (só no nível de design)
Agrupe comandos e eventos em torno da coisa que precisa estar consistente para aceitar o comando. Essa coisa é um agregado candidato. Agrupe a linha do tempo em áreas onde a linguagem e a propriedade permanecem as mesmas. Esses são os contextos delimitados candidatos.

## Formato

```
## Escopo e nível
<processo ou área> — <visão geral | processo | design>

## Linha do tempo
| # | Evento | Disparado por (comando) | Ator / sistema / política / tempo | Modelo de leitura necessário | Notas |
|---|---|---|---|---|---|

## Políticas
- Sempre que <evento>, então <comando> (<automática | manual | condicional: …>)

## Pontos críticos
| # | Onde | Pergunta / conflito | Quem responde |

## Agregados candidatos (nível de design)
| Agregado | Comandos aceitos | Eventos emitidos | Regras que protege |

## Contextos candidatos
<eventos pivô e mudanças de linguagem que sugerem fronteiras>
```

Um `flowchart LR` em Mermaid da linha do tempo é opcional, para fluxos com muitas ramificações.

## Próximo

- `bounded-context-mapping` com os contextos candidatos.
- `domain-modeling` com os agregados, regras e eventos candidatos.
- `requirements-gathering` com os pontos críticos e as políticas como regras a confirmar.

## No Forja

No Forja, grave a linha do tempo e os pontos críticos em `memory/30-domains/<contexto>/event-storming.md` e rode `forja sync:universal`. Os pontos críticos viram perguntas na spec (`specs/<slug>/spec.md`, §7) até serem respondidos.

## Evite

- Começar por entidades ou tabelas.
- Eventos no presente ou como CRUD ("Pedido Atualizado"). Pergunte o que de fato aconteceu.
- Preencher lacunas com regras plausíveis. Marque um ponto crítico.
- Desenhar agregados antes de a linha do tempo estar acordada.
- Eventos técnicos ("Linha Inserida", "Mensagem Enviada ao Kafka") nos níveis de visão geral ou de processo.
