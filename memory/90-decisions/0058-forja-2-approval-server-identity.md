# ADR-0058 — Decisão de approval com identidade server-side

- **Status**: accepted
- **Data**: 2026-08-01
- **Contexto**: O dashboard precisava responder approvals sem permitir que o cliente escolhesse ou falsificasse o aprovador.
- **Decisão**: O cliente envia somente `approved` ou `rejected`. O Route Handler valida o valor, exige `FORJA_APPROVER_ID`, injeta o aprovador e timestamp, e encaminha a decisão ao Control Plane usando o token server-side.
- **Regras**:
  - ausência de `FORJA_APPROVER_ID` retorna configuração indisponível;
  - qualquer decisão fora do enum é rejeitada;
  - o valor de `approverId` vindo do cliente é ignorado;
  - Policy/ApprovalLedger continuam responsáveis por validade, expiração e idempotência semântica;
  - a UI não exibe nem recebe segredo de autenticação.
- **Alternativas rejeitadas**: aceitar aprovador no body do browser; usar identidade fixa inventada; aprovar automaticamente quando não houver configuração.
- **Consequências**: O dashboard operacional exige configuração explícita do ambiente para decidir approvals. Listagem continua possível sem identidade de decisão.
- **Evidências**: `apps/dashboard/app/api/forja/approval.ts`, `apps/dashboard/app/api/forja/[...path]/route.ts`, `apps/dashboard/app/dashboard-client.tsx`, `test/dashboard-approval.test.js`, 267 testes.
