---
name: observability
description: Use quando preparar um serviço ou funcionalidade para produção: deriva SLIs e SLOs dos requisitos não funcionais, planeja métricas, logs estruturados e traces, e define alertas baseados em sintomas, cada um com um esboço de runbook.
---

# Observabilidade

Um sistema é observável quando você consegue responder a uma pergunta nova sobre o comportamento dele em produção sem publicar código novo. O objetivo não são dashboards: é saber que os usuários estão sofrendo antes que eles avisem, e descobrir o porquê rápido.

A saída padrão é um **plano de observabilidade**: SLOs, sinais e alertas. Escreva código de instrumentação só quando o usuário pedir.

## Convenções

- Entradas: `RNF-NN` mensuráveis de `requirements-gathering`; endpoints de `api-design`; classificação de dados pessoais de `lgpd-compliance`; eventos de segurança de `threat-modeling`.
- Siga o código existente: a biblioteca de log, o backend de métricas e a configuração de tracing. Use [OpenTelemetry](https://opentelemetry.io/) e suas convenções semânticas como padrão quando não houver nada.
- Tráfego, metas ou escalas de plantão desconhecidos vão para **Perguntas em aberto**. Não invente metas de SLO; derive-as ou pergunte.

## SLIs e SLOs

- Um **SLI** mede o que o usuário experimenta, como a razão entre eventos bons e eventos válidos: disponibilidade (respostas não-5xx / todas as respostas), latência (requisições abaixo de X ms / todas as requisições), atualidade, correção.
- Um **SLO** é a meta de um SLI numa janela: "99,5% dos `POST /orders` abaixo de 300 ms em 28 dias".
- Derive cada SLO de um `RNF-NN`. Quando o requisito não for mensurável, devolva-o para `requirements-gathering`.
- O **orçamento de erro** (100% − SLO) é o que os alertas e as decisões de release consomem.
- Poucos SLOs, nas jornadas de usuário que importam. Não um por endpoint.

## Métricas

- **RED** para serviços guiados por requisições: Taxa (Rate), Erros, Duração (como histograma, nunca média).
- **USE** para recursos: Utilização, Saturação, Erros (pools, filas, CPU, memória).
- **Métricas de negócio** que dizem se a funcionalidade funciona: pedidos criados, pagamentos que falharam.
- Só labels com cardinalidade limitada: template da rota, método, classe do status. Nunca IDs de usuário, e-mails ou URLs cruas.

## Logs

- Estruturados (JSON), um evento por linha, com `timestamp`, `level`, `message`, `service`, `trace_id` e os identificadores de domínio necessários para investigar (ID do pedido, não o nome do cliente).
- Os níveis significam algo: `error` exige ação; `warn` é inesperado mas tratado; `info` é um evento de negócio ou de ciclo de vida; `debug` fica desligado em produção.
- **Nada de dados pessoais, segredos ou tokens** nos logs (conforme `lgpd-compliance`). Quando for preciso um identificador, use um ID pseudônimo.
- Registre nas fronteiras e nas decisões, não em toda linha. Registre cada erro uma vez, onde ele é tratado.
- Os eventos de segurança de `threat-modeling` (falhas de autenticação, permissões negadas, acionamentos do limite de taxa) são registrados com o ator e o objeto.

## Traces

- Propague o contexto em toda fronteira: HTTP, filas, jobs (W3C Trace Context).
- Spans para requisições de entrada, chamadas de saída, consultas ao banco e operações de fila, com atributos semânticos.
- Amostre por taxa, mas mantenha todos os traces de erro e os lentos quando o backend suportar amostragem na cauda (tail sampling).

## Alertas

- Alerte sobre **sintomas** que os usuários sentem (taxa de consumo do SLO), não sobre causas (CPU em 80%).
- Use alertas de taxa de consumo com múltiplas janelas: consumo rápido aciona plantão (por exemplo, 2% do orçamento em 1 h), consumo lento abre um ticket (por exemplo, 10% em 3 dias).
- Todo acionamento de plantão é acionável, urgente e precisa de um humano. O resto é ticket ou dashboard.
- Todo alerta aponta para um esboço de runbook: o que significa, primeiras verificações, mitigação, escalonamento.

## Formato

```
## SLOs
| SLO | SLI (bons / válidos) | Meta | Janela | Origem |
|---|---|---|---|---|
| Latência de criação de pedido | POST /orders < 300 ms / todos os POST /orders | 99,5% | 28d | RNF-03 |

## Métricas
| Nome | Tipo | Labels | Finalidade |

## Logs
<eventos por caso de uso: nível, mensagem, campos>

## Traces
<fronteiras instrumentadas, amostragem>

## Alertas
| Alerta | Condição | Severidade (plantão/ticket) | Runbook |

## Esboços de runbook
### <Alerta>
Significado: … Primeiras verificações: … Mitigação: … Escalonamento: …

## Perguntas em aberto
```

## Próximo

- `testing`: verifique que os eventos de negócio críticos e os erros são registrados e medidos.
- `pull-request`: liste os sinais e alertas novos em "O quê".

## Evite

- Alertar sobre toda métrica de causa.
- Médias para latência.
- Labels de alta cardinalidade.
- Dados pessoais, segredos ou corpos inteiros de requisição em logs ou atributos de span.
- SLOs em 100%, ou metas tiradas do nada.
- Dashboards que ninguém olha em vez de alertas que importam.
