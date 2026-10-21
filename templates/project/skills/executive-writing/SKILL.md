---
name: executive-writing
description: Use quando uma análise consolidada precisa virar comunicação orientada à decisão para gestores, conselhos ou times: resumos executivos, pareceres, memorandos, apresentações e comunicados de decisão, com fatos, alternativas, recomendação, plano de ação e limitações.
---

# Redação Executiva

Transforma análises complexas em comunicação clara, curta e orientada à decisão. Entrada: análises, diagnósticos e recomendações consolidados (de `requirements-gathering`, `architecture-decision-record`, `technical-spike`, `lgpd-compliance` ou do usuário). Saída: a versão final para gestores, o conselho ou os times operacionais.

O texto serve a uma decisão. Se o leitor termina e não sabe o que decidir ou o que fazer em seguida, o texto falhou.

## Convenções

- Termos em pt-BR seguidos do en-US: Resumo Executivo (Executive Summary), Parecer (Opinion), Memorando (Memo), Comunicado de Decisão (Decision Announcement), Pirâmide de Minto (Minto Pyramid), Sumário Decisório (Decision Brief), Plano de Ação (Action Plan), Trade-off.
- Toda afirmação é marcada pela natureza quando isso importa: **fato** (com fonte), **hipótese**, **inferência**, **lacuna**.
- Escreva no vocabulário do leitor: executivo (impacto, custo, risco, prazo) ou operacional (quem faz o quê, quando, como).

## Princípio central

Resposta primeiro, sustentação depois (Pirâmide de Minto). Comece pela decisão ou recomendação, depois os poucos argumentos que a sustentam, depois a evidência. Sintetize, não resuma: corte redundância e jargão, mas nunca precisão ou rastreabilidade.

## Processo

### 1. Contexto e leitor
Qual é a situação, o que precisa ser decidido, quem decide e do que precisa para decidir. Leitores executivos e operacionais recebem textos diferentes.

### 2. Inventariar o material
Dados, documentos, regras e restrições disponíveis. Separe fatos, hipóteses, inferências e lacunas. Nada é acrescentado que o material não sustente.

### 3. Enquadrar a decisão
Uma frase: o que precisa ser decidido ou analisado. Se não há decisão, declare a finalidade (informar, alinhar, registrar).

### 4. Analisar
Diagnóstico estruturado: causas, impactos, relações. Distinga correlação de causalidade. Questione práticas mantidas só por hábito.

### 5. Comparar alternativas
Opções viáveis lado a lado, cada uma com benefícios, desvantagens, custo, risco e dependências. Explicite os trade-offs. Não fazer nada é uma alternativa quando é viável. Tecnologia nunca é a resposta automática.

### 6. Recomendar
Específica, priorizada, justificada. Ligue cada recomendação a um resultado mensurável.

### 7. Plano de ação e limitações
Ações com responsáveis sugeridos, prazos, prioridades, dependências e indicadores de sucesso. Depois: dados faltantes, incertezas e pontos que precisam de validação, e quem precisa validá-los.

### 8. Moldar para o entregável
Escolha o formato e enxugue para ele (veja abaixo). Linha narrativa: o título de cada seção enuncia a sua conclusão, de modo que ler só os títulos conte a história.

## Entregáveis

- **Resumo executivo**: uma página ou menos; recomendação, impacto, risco, próximos passos.
- **Parecer**: estrutura completa; raciocínio e limitações explícitos.
- **Memorando**: uma página; contexto, decisão necessária, recomendação, ações.
- **Apresentação**: linha narrativa, uma mensagem por slide, o título enuncia a conclusão.
- **Comunicado de decisão**: o que foi decidido, por quê, o que muda para quem, a partir de quando.

## Formato de saída

```
# <Título que enuncia a conclusão>

## Resumo
<Recomendação em 2–3 frases: decisão, impacto, risco, próximo passo.>

## Contexto
<Situação em poucas linhas.>

## Problema ou decisão
<O que precisa ser decidido.>

## Evidências
- <fato> — <fonte>

## Análise
<Causas, impactos, relações. Hipóteses marcadas como tal.>

## Alternativas
| Opção | Benefícios | Desvantagens | Custo | Risco | Dependências |

## Recomendação
<Específica, priorizada, justificada.>

## Plano de ação
| Ação | Responsável sugerido | Prazo | Prioridade | Depende de | Indicador |

## Limitações
- <dado faltante / incerteza> — validar com <quem>
```

## Evite

- Inventar dados, fatos, números ou evidências.
- Apresentar uma hipótese como conclusão.
- Recomendações genéricas ("melhorar a comunicação", "investir em tecnologia").
- Propor tecnologia como solução automática.
- Omitir custos, riscos, restrições ou efeitos colaterais.
- Tratar correlação como causalidade.
- Enterrar a recomendação no fim.
- Redundância, jargão e rodeios que escondem a mensagem.
- Listar várias alternativas sem compará-las.
