---
name: release-checklist
description: Use antes de implantar uma release em produção: verifica migrações, feature flags, plano de rollback, observabilidade, comunicação e momento, e dá uma recomendação de go/no-go com os bloqueadores.
---

# Checklist de Release

Um deploy é seguro quando desfazê-lo é fácil e você vai saber rápido se precisa. Este checklist confirma as duas coisas antes de a mudança chegar aos usuários, para que os problemas apareçam numa revisão e não num incidente.

A saída padrão é um **checklist preenchido com uma recomendação de go/no-go**. A decisão é do usuário; implantar nunca faz parte desta skill.

## Convenções

- Entradas: a release de `release-notes` (versão, mudanças incompatíveis); o plano de migração de `data-migrations`; SLOs e alertas de `observability`; riscos em aberto de `threat-modeling`; o status do CI de `ci-pipeline-review`.
- Cada item é ✅ (feito, com evidência), ⚠ (risco aceito, com motivo e dono), ❌ (bloqueador) ou N/A (com motivo).
- Evidência é um link, a saída de um comando ou uma pessoa nomeada. "Deve estar tudo bem" não é evidência.
- Dimensione pela mudança: uma correção de texto precisa dos itens centrais; uma mudança de esquema ou uma API incompatível precisa de todos.

## Checklist

**Escopo**
- O que vai: versão, PRs e commits desde a última release. Nada sem revisão ou sem merge.
- Mudanças incompatíveis listadas, com os consumidores avisados.

**Build e testes**
- CI verde no commit ou artefato exato que será implantado.
- O artefato é o que foi testado (mesmo digest de imagem), não reconstruído.
- Staging (ou equivalente) rodou esta versão, com os smoke tests passando.

**Banco de dados**
- As migrações são retrocompatíveis com a versão que está rodando (só a fase de expansão; veja `data-migrations`).
- Risco de lock e de duração avaliado para tabelas grandes; `lock_timeout` definido.
- Preenchimentos rodam separados e são retomáveis.
- Passos de contração (remoções) **não** estão nesta release, a menos que o código antigo já tenha saído.
- Backup ou recuperação point-in-time confirmados recentes.

**Feature flags**
- Comportamento arriscado atrás de uma flag, desligada por padrão, com interruptor de emergência.
- Cada flag tem um dono e uma data de remoção.
- Os estados das flags para este rollout estão escritos (quem vê o quê, quando).

**Rollback**
- Como reverter: artefato anterior, flag desligada ou rollback da migração. Passos escritos e testados pelo menos uma vez.
- Quem decide, e o gatilho (por exemplo, taxa de erro acima do alerta de consumo do SLO por 10 minutos).
- O que não pode ser revertido (dados gravados num formato novo, e-mails enviados, chamadas externas) está nomeado.

**Observabilidade**
- Dashboards e alertas para os caminhos alterados existem e funcionam (veja `observability`).
- Uma janela de observação depois do deploy, com uma pessoa nomeada acompanhando.
- Sinais de sucesso conhecidos: como "funcionando" aparece nas métricas.

**Segurança e compliance**
- Os itens de `threat-modeling` em aberto para esta mudança estão mitigados ou aceitos com dono.
- Tratamento novo de dados pessoais revisado sob `lgpd-compliance`.
- Segredos e configuração presentes no ambiente de destino.

**Comunicação**
- Release notes prontas; suporte avisado das mudanças visíveis.
- Usuários ou consumidores da API avisados de mudanças incompatíveis e de janelas de manutenção.
- O time sabe o horário do deploy e o canal para reportar problemas.

**Momento**
- Fora de um congelamento ou de um pico de tráfego; não no fim do último dia útil antes de as pessoas ficarem indisponíveis.
- As pessoas que conseguem reverter estão disponíveis durante a janela de observação.

**Depois do deploy**
- Smoke tests em produção.
- Ponto de decisão no fim da janela de observação: manter, reverter ou corrigir para frente.

## Recomendação

- **Go**: nenhum ❌; todo ⚠ tem dono.
- **Go com condições**: nenhum ❌, mas itens ⚠ exigem um passo antes (por exemplo, "implantar com a flag desligada").
- **No-go**: qualquer ❌. Liste o que libera cada um.

## Formato

```
# Release <versão> — <data/hora UTC>

| Área | Item | Status | Evidência / nota |
|---|---|---|---|

## Bloqueadores
## Riscos aceitos (dono)
## Plano de rollback
## Recomendação: <Go | Go com condições | No-go> — <motivo em uma linha>
```

## Próximo

- `executive-writing` para uma nota de go/no-go às partes interessadas.
- `incident-postmortem` se o rollout der errado.

## No Forja

No Forja, inclua na verificação os gates do projeto: `forja project:check`, `forja spec:check`, `forja tools:doctor` e `forja project:wire --check`. Riscos aceitos com dono podem virar ADR.

## Evite

- Marcar itens sem evidência.
- Publicar as migrações e o código que precisa delas como um par incompatível.
- Flags sem interruptor de emergência ou sem data de remoção.
- Um plano de rollback nunca testado.
- Implantar sem ninguém acompanhando.
- Implantar como parte desta skill.
