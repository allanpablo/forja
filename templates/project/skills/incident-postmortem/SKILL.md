---
name: incident-postmortem
description: Use depois de um incidente em produção: escreve um postmortem sem culpados, com o impacto em números, uma linha do tempo em UTC, fatores contribuintes encontrados com os 5 Porquês, o que deu certo e ações com dono para prevenir, detectar e mitigar uma recorrência.
---

# Postmortem de Incidente

Um postmortem transforma um incidente em aprendizado. Ele é **sem culpados**: as pessoas agiram de forma razoável com a informação e as ferramentas que tinham, então a pergunta é o que no sistema deixou a falha acontecer e se espalhar, não quem errou.

A saída padrão é um **documento de postmortem**. Ele é escrito a partir das evidências que o usuário fornece; o que não tem evidência é marcado como não confirmado.

## Convenções

- Entradas: alertas, dashboards e logs de `observability`; transcrições do chat e do canal do incidente; histórico de deploys e mudanças (`git log`, execuções do CI); as pessoas envolvidas, por meio do usuário.
- Horários em UTC, com a fonte de cada entrada.
- Refira-se às pessoas pelo papel ("a pessoa de plantão"), não pelo nome.
- Idioma: o do usuário. Termos técnicos como o time os usa.
- Incógnitas vão para **Perguntas em aberto**. Nunca invente uma entrada na linha do tempo ou uma causa.

## Linguagem sem culpados

- Descreva ações e decisões, e o contexto que as tornou razoáveis: "O deploy rodou sem canary porque o pipeline não tinha etapa de canary."
- Não "X esqueceu", "X deveria ter", "erro humano". Erro humano é um sintoma; pergunte o que tornou o erro fácil e o efeito dele grande.
- Contrafactuais ("se ao menos tivessem…") vão para as ações, não para a narrativa.

## Processo

### 1. Impacto
Em números: duração (início → mitigado → resolvido), usuários ou requisições afetados, taxa de erro, dados perdidos ou corrompidos, dinheiro, orçamento de erro do SLO consumido, implicações contratuais ou de LGPD (um incidente com dados pessoais pode exigir comunicação à ANPD: verifique com `lgpd-compliance`).

### 2. Linha do tempo
Do primeiro gatilho (muitas vezes uma mudança dias antes) até a resolução. Marque os momentos-chave: **gatilho**, **detecção** (como: alerta, cliente, acaso), **início da resposta**, **mitigação**, **resolução**. Calcule o tempo até a detecção e o tempo até a mitigação.

### 3. Fatores contribuintes
Sistemas complexos raramente falham por uma causa só. Liste os fatores que se combinaram: o gatilho, as condições latentes que permitiram que ele quebrasse as coisas, o que atrasou a detecção e o que desacelerou a mitigação. Para cada um, pergunte "por quê?" até chegar a algo que o time consiga mudar (5 Porquês), e pare aí.

### 4. O que deu certo, o que deu errado, onde tivemos sorte
Sorte é um achado: ela marca uma defesa que ainda não existe.

### 5. Ações
- Cada uma trata de um fator contribuinte e é de um destes tipos: **prevenir** (impedir o gatilho ou a condição latente), **detectar** (alertar mais cedo), **mitigar** (impacto menor, recuperação mais rápida).
- Específicas, com dono (um papel ou time), com ticket e com data. "Ter mais cuidado" não é uma ação.
- Prefira mudanças no sistema (testes, proteções, automação, alertas) a lembretes de processo.
- Poucas ações concluídas valem mais que uma lista longa que apodrece.

## Formato

```
# Postmortem: <título> — <data>
Status: <rascunho | revisado> · Severidade: <SEV-n> · Autores: <papéis>

## Resumo
<3–4 frases: o que aconteceu, impacto, causa em resumo, estado atual>

## Impacto
| Métrica | Valor |

## Linha do tempo (UTC)
| Horário | Evento | Fonte |
Tempo até detectar: … · Tempo até mitigar: … · Tempo até resolver: …

## Fatores contribuintes
### <fator>
<descrição> — Cadeia de porquês: … → …

## O que deu certo / errado / onde tivemos sorte

## Ações
| # | Ação | Tipo (prevenir/detectar/mitigar) | Fator | Dono | Ticket | Prazo |

## Perguntas em aberto
```

## Próximo

- `requirements-gathering`: `RNF-NN` novos a partir das ações.
- `testing`: um teste de regressão para o modo de falha.
- `observability`: alertas novos ou mudanças de SLO para as lacunas de detecção.
- `architecture-decision-record` quando a correção for uma mudança de design.
- `executive-writing` para um resumo curto à liderança ou aos clientes.

## No Forja

No Forja, registre o incidente no grafo de engenharia com `forja incident:record --title "<título>" --description "<resumo>"`; incidentes parecidos aparecem em `forja incident:similar`. O documento do postmortem fica em `memory/60-runs/postmortems/<data>-<slug>.md`.

## Evite

- Nomes e culpa, inclusive culpa implícita ("apesar do runbook…").
- Uma única causa raiz quando vários fatores se combinaram.
- Ações sem dono ou sem data.
- "Monitorar mais de perto" ou "ter mais cuidado" como ações.
- Linhas do tempo reconstruídas de memória, sem fontes.
- Publicar antes de as pessoas envolvidas revisarem.
