# Plan: {{FEATURE}}

- **Spec**: ./spec.md
- **Status**: draft | review | approved
- **Criado em**: {{DATE}}

> Como vamos construir o que a spec define. Sem código aqui — só estrutura e decisões.

## 1. Abordagem técnica
<Visão geral em 3-5 linhas. Qual estratégia (extend vs. rewrite, lib vs. service, sync vs. async).>

## 2. Módulos afetados
| Caminho | Mudança | Risco |
|---|---|---|
| `lib/...` | criar / editar / remover | B/M/A |
| `scripts/...` | ... | ... |

## 3. Diagrama de fluxo
```
<ASCII ou descrição textual do fluxo de dados/controle>
```

## 4. Contratos (API/CLI/Schema)
<Assinatura de funções públicas, endpoints, formato de arquivos novos.>

## 5. Decisões e alternativas
**D1**: <decisão> — alternativas rejeitadas: <A> (por X), <B> (por Y)
**D2**: ...

Se alguma D é estrutural ou irreversível, abra ADR em `memory/90-decisions/` e referencie aqui.

## 6. Dependências
- Outras specs: ...
- Pacotes npm: ...
- Migrações de dado/memory: ...

## 7. Rollout
- [ ] Feature flag necessária?
- [ ] Migração de dados existentes?
- [ ] Doc/persona impactada?

## 8. Sinais de fracasso (kill criteria)
<O que faria abandonar essa abordagem mid-flight?>

## Evidências e estado real
- Relacione cada critério AC à task responsável e ao comando ou observação que o verifica.
- Registre resultado, data e limitações; marque concluído somente após verificar.
- Diferencie hipótese, estimativa e medição. Remova exemplos que não se aplicam.
- Documente falhas esperadas, compatibilidade e recuperação quando houver mudança de contrato.
- Para LLMs, separe sucesso de execução, formato válido e aceite por checks independentes.
