---
name: requirements-elicitation
description: Use quando o conhecimento ainda precisa ser extraído das partes interessadas: prepara roteiros de entrevista, conduz rodadas de perguntas com o usuário como especialista do domínio e registra achados brutos com fonte, conflitos e lacunas.
---

# Elicitação de Requisitos

Extrai o que as partes interessadas sabem, inclusive o que elas não percebem que sabem. O produto são **achados brutos, com fonte**, não um documento de requisitos. Estruturá-los é trabalho da skill `requirements-gathering`.

A elicitação trata do negócio, nunca da solução. Telas, tabelas e tecnologias vêm depois.

## Convenções

- Termos em pt-BR seguidos do en-US: Parte Interessada (Stakeholder), Ator (Actor), Conhecimento Tácito (Tacit Knowledge), Regra de Negócio (Business Rule), Exceção (Exception), Contorno (Workaround), Linguagem Ubíqua (Ubiquitous Language).
- Registre as próprias palavras das partes interessadas para termos do domínio. Não as traduza para vocabulário técnico.
- Todo achado traz sua fonte e sua natureza: **declarado** (alguém disse), **observado** (visto num documento, planilha, formulário ou sistema legado), **inferido** (sua interpretação, pendente de confirmação).

## Princípio central

As pessoas descrevem o fluxo normal e esquecem as exceções, porque é nas exceções que elas contornam o sistema sem pensar. O valor da elicitação está nas exceções, nos contornos e no "depende". Casos de borda também são requisitos: um retrato só do caminho feliz é incompleto por definição.

## Modos

1. **Preparar uma sessão**: o usuário vai conversar com as partes interessadas. Produza o mapa de partes interessadas e um roteiro de entrevista.
2. **Elicitar diretamente**: o usuário é o especialista do domínio. Faça perguntas em rodadas e registre os achados.

Quando o modo não estiver claro, pergunte qual é.

## Processo

### 1. Mapear as partes interessadas
Quem usa, quem decide, quem paga, quem é afetado, quem audita, quem opera o processo atual. Para cada uma: o que sabe, o que quer, o que teme. Partes interessadas ausentes são um risco: nomeie-as.

### 2. Escolher as técnicas
- **Entrevista**: padrão para entender objetivos e regras.
- **Observação (shadowing)**: quando o processo é manual ou habitual; as pessoas fazem mais do que descrevem.
- **Análise de artefatos**: formulários, planilhas, relatórios, telas e bancos legados. Cada coluna de uma planilha mantida à mão é um requisito que ninguém escreveu.
- **Percurso de cenário**: percorra um caso real e recente do início ao fim.
- **Exemplos concretos**: peça números e casos reais para fixar as regras ("me dê um exemplo em que o desconto não foi aplicado").
- **Workshop**: quando várias partes interessadas discordam ou são donas de partes diferentes do fluxo.

### 3. Perguntar em camadas
Faça rodadas de no máximo 5–7 perguntas. Cada rodada aprofunda o que a anterior abriu.

- **Contexto**: qual é o objetivo? O que acontece hoje sem o sistema? O que mais dói?
- **Fluxo**: o que inicia o processo? Quem faz o quê, em que ordem? O que o encerra?
- **Regras**: o que decide cada passo? Quem pode fazer, e quando não pode? Há limites, prazos, aprovações?
- **Exceções**: o que acontece quando dá errado, atrasa, é cancelado, é feito duas vezes? Qual foi o caso mais chato do mês passado? Que entradas são inválidas, ausentes ou inesperadas? Que restrições nunca podem ser quebradas?
- **Contornos**: o que vocês fazem fora do sistema hoje? Qual planilha, mensagem, anotação?
- **Dados**: que informação é necessária em cada passo? De onde vem? Quem corrige quando está errada?
- **Volume e frequência**: quantos por dia, nos horários de pico? Quantos usuários ao mesmo tempo?
- **Resultado**: como vocês sabem que funcionou? O que faria este projeto ser um fracasso?

### 4. Perguntar bem
- Perguntas abertas primeiro; fechadas só para confirmar.
- Uma pergunta por vez; nada de perguntas compostas.
- Nada de perguntas indutoras ("você ia querer um dashboard, né?").
- Pergunte "por quê" até o objetivo aparecer por trás do pedido. Uma funcionalidade pedida muitas vezes é a solução para um problema não dito.
- Peça exemplos sempre que uma resposta tiver "normalmente", "depende", "às vezes" ou "sempre".
- Devolva o que entendeu, nas palavras deles, e peça que corrijam.

### 5. Registrar os achados
Capture fatos, não conclusões. Separe o que foi dito do que você acha que significa.

### 6. Revelar conflitos e lacunas
Partes interessadas descrevendo a mesma coisa de formas diferentes é um achado, não ruído. Registre as duas versões e quem disse cada uma. Nunca resolva um conflito escolhendo uma por conta própria.

Perguntas são entregáveis. Cada lacuna vira uma pergunta precisa dirigida a uma pessoa nomeada; nunca a preencha com uma suposição.

## Formato do roteiro (modo preparar)

```
# Roteiro de elicitação: <tema>

## Partes interessadas
| Parte interessada | Papel | Sabe sobre | Quer | Preocupações |

## Objetivo da sessão
<O que precisa estar entendido ao final.>

## Perguntas
### Contexto
1. ...
### Fluxo
### Regras
### Exceções e contornos
### Dados
### Volume
### Resultado

## Artefatos a pedir
- <formulários, planilhas, relatórios, telas>
```

## Formato dos achados

```
# Achados de elicitação: <tema>

## Achados
| # | Achado | Fonte | Natureza (declarado / observado / inferido) |

## Termos do domínio ouvidos
- <termo>: <significado nas palavras deles> — <quem usa>

## Exceções e contornos
- <caso> — <como é tratado hoje>

## Conflitos
- <tema>: <versão A, fonte> vs <versão B, fonte>

## Lacunas e próximas perguntas
- <o que ainda não se sabe> — perguntar a <quem>
```

## No Forja

No Forja, grave os achados em `memory/10-product/elicitacao-<tema>.md` e rode `forja sync:universal`, para que `requirements-gathering` e as outras IAs os encontrem com `forja query:universal "<tema>"`.

## Evite

- Falar de telas, tabelas, frameworks ou arquitetura.
- Aceitar uma solução pedida sem perguntar que problema ela resolve.
- Apresentar inferências como fatos declarados.
- Questionários com 30 perguntas de uma vez.
- Resolver conflitos entre partes interessadas por conta própria.
- Parar no caminho feliz.
