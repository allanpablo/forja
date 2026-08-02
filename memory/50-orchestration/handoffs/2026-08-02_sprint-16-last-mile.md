# Handoff — Sprint 16: última milha

- objetivo: fechar lacunas verificáveis para a avaliação 10/10;
- concluído: rollback explícito de sandbox; reversão Git por patch binário; benchmark JSON determinístico; manifests oficiais GitHub/Docker; testes de isolamento;
- decisões: `promoted → rolled_back` é terminal; plugins oficiais são boundaries sem rede implícita; benchmark usa checksum e proxy bytes/4;
- restrições: rollback exige diff da mesma sessão; handlers externos dependem de adapters permissionados;
- evidências: testes `sandbox`, `adapter-git`, `context-benchmark`, `official-plugins`; `npm test` 300/300; build TypeScript aprovado; benchmark mediu 95,72% de redução nesta árvore;
- pendências: executar `release:check --publish` em árvore limpa e decidir publicação 2.0.3; integrar handlers externos reais apenas com credenciais e sandbox apropriadas;
- critérios de aceite: todos os testes e build aprovados;
- bloqueios: nenhum bloqueio técnico nesta sprint;
- próximo agente: Governance/Release Auditor.
