# ADR-0043 — Sprint, Task e Handoff como engines de domínio

- **Status**: accepted
- **Data**: 2026-07-31
- **Contexto**: O runtime precisa de unidades retomáveis, rastreáveis e pequenas para organizar execução agêntica.
- **Decisão**: Implementar `SprintEngine`, `TaskEngine` e `HandoffEngine` em `packages/orchestration`, usando `OrchestrationStore`, `CompletionValidator` e `GraphRecorder` como portas. A implementação em memória serve como referência determinística; persistência durável e adapters ficam fora do domínio.
- **Regras**:
  - Task só pode iniciar em Sprint ativo e suas dependências devem estar concluídas para aparecer em `next`.
  - Task e Sprint não podem ser concluídos sem validação independente com status `accepted`.
  - Handoff é um resumo estruturado, com evidências obrigatórias, deduplicação e limites de compactação; transcrições completas não são aceitas.
  - Atualizações do GraphLoop recebem relações e evidências por uma porta, sem importar o pacote GraphLoop.
- **Alternativas rejeitadas**:
  - Persistir diretamente em SQLite: violaria a independência do domínio e anteciparia o adapter.
  - Permitir que o executor declare conclusão: permitiria falsa conclusão sem gate de validação.
- **Consequências**: Os adapters futuros devem implementar `OrchestrationStore`, e o GraphLoop deve consumir os registros de `GraphRecorder`. A API de validação permanece explícita para permitir testes e validators independentes.
- **Evidências**: `test/orchestration.test.js`; `npm run types:check`; `git diff --check`.
