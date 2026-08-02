# ADR-0069 — Demonstração de autonomia com sandbox Git real

- **Status:** aceito
- **Data:** 2026-08-01
- **Decisão:** o caminho demonstrável de autonomia deve usar uma fixture externa, Git
  worktree real, comandos reais, aprovação persistida, Validator independente e
  promoção explícita. O agente da fixture pode ser determinístico para manter a prova
  offline e repetível.
- **Motivo:** os testes anteriores validavam o contrato do sandbox, mas usavam store e
  backend simulados; isso não comprovava isolamento, subprocesso, diff ou promoção.
- **Consequências:** `npm run demo:autonomy` é uma prova operacional e não depende de
  LLM. O cenário usa um teste Node nativo para evitar instalação de dependências na
  fixture e deixa SQLite, Git e npm observáveis.
- **Evidências:** `scripts/demo-autonomy.ts` e `test/demo-autonomy.test.js`.
- **Próximos passos:** repetir a mesma composição no MCP stdio e no bootstrap oficial
  do servidor; adicionar rollback e cenários de caos.
