# ADR-0072 — Limites de ambiente e caminho no adapter Git

- **Status:** aceito
- **Decisão:** `SpawnCommandRunner` herda apenas variáveis operacionais mínimas
  (`PATH`, temporários e `NODE_PATH`) e permite overrides explícitos. O
  `GitGraphDocumentSource` rejeita locators que escapem da raiz resolvida.
- **Motivo:** comandos de sandbox não devem copiar secrets do processo e fontes
  Git não devem transformar um locator malicioso em leitura fora do workspace.
- **Evidência:** testes de segurança em `test/adapter-git.test.js`.
