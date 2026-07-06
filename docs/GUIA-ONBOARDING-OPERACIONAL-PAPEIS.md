# Guia Operacional por Papel

Este guia define responsabilidades objetivas por papel para execução previsível e validação segura até produção.

## 1) DEV

### Missão
Implementar com qualidade, manter contexto atualizado e reduzir retrabalho.

### Checklist Diário
- Ler contexto mínimo (`memory/00-global`, `20-architecture`, `current-sprint`).
- Executar tarefa com dono de escopo claro.
- Rodar testes mínimos da mudança.
- Atualizar documentação impactada.
- Atualizar resumo/handoff quando necessário.
- Rodar sync da memória operacional:
```bash
cd backend
npm run memory:db:sync
```

### Critério de Pronto (DEV)
- Código implementado
- Teste mínimo ok
- Sem quebra conhecida
- Documentação atualizada
- Risco registrado

## 2) QA

### Missão
Garantir que comportamento, qualidade e critérios de aceite estejam validados.

### Checklist QA
- Validar critérios de aceite do step.
- Rodar cenários críticos (feliz + erro).
- Verificar regressão funcional.
- Validar contrato de API (status, payload, erro).
- Registrar evidências objetivas.

### Saída QA
- `Aprovado` / `Aprovado com ressalvas` / `Reprovado`
- Bugs com severidade e impacto
- Recomendação para gate de produção

## 3) SRE

### Missão
Assegurar estabilidade operacional, observabilidade e rollback.

### Checklist SRE
- Healthcheck funcional.
- Logs e métricas essenciais disponíveis.
- Alertas mínimos ativos.
- Rollback documentado e testável.
- Dependências externas validadas.

### Gate SRE
Sem rollback executável e sem observabilidade mínima: **NO-GO**.

## 4) TECH LEAD

### Missão
Orquestrar plano, reduzir risco sistêmico e garantir decisão técnica coerente.

### Checklist Tech Lead
- Quebrar demanda em steps testáveis.
- Validar dependências e ordem de execução.
- Garantir ownership sem sobreposição de escrita.
- Exigir ADR em decisão estrutural.
- Consolidar riscos antes de produção.

### Entregável Tech Lead
- Plano final da sprint
- Matriz de risco
- Recomendação Go/No-Go

## 5) Fluxo Integrado (papéis)

1. Tech Lead/Orchestrator define steps e donos.
2. Dev implementa + testa + documenta.
3. QA valida critérios e regressão.
4. SRE valida operação e rollback.
5. Tech Lead consolida e decide com stakeholders.

## 6) Questionamento Obrigatório por Step

Antes de executar, todos devem responder:
- Está claro o objetivo e o critério de sucesso?
- Dependências e bloqueios estão explícitos?
- Risco e impacto foram mapeados?
- Existe forma de validar e de reverter?

Se qualquer item for “não”: refinar step antes da execução.

## 7) Comandos Úteis

### Setup
```bash
cd backend
npm install
npm run memory:db:init
npm run memory:db:sync
```

### Consulta de contexto
```bash
npm run memory:db:query -- "search" "auth" 10
npm run memory:db:query -- handoffs 10
npm run memory:db:query -- adrs 20
```

### Registrar handoff
```bash
cd ..
node scripts/append-handoff.mjs orchestrator backend-nest "implementar modulo auth"
```

## 8) Gate Final de Produção

### GO quando:
- DEV, QA e SRE aprovaram seus checklists
- riscos críticos mitigados
- rollback pronto

### NO-GO quando:
- risco crítico aberto
- falha de segurança
- ausência de evidência de validação

---

## 9) Princípio de operação

Qualidade, documentação e continuidade de contexto são parte da entrega técnica.
Não são atividades opcionais.
