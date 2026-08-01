# ADR-0053 — Plugin SDK com permissões declaradas

- **Status**: accepted
- **Data**: 2026-07-31
- **Contexto**: Extensões precisam consumir o Forja sem receber acesso implícito ao processo, filesystem, banco ou capabilities não autorizadas.
- **Decisão**: `@forja/plugin-sdk` registra manifestos validados e entrega ao plugin somente um `PluginContext` composto por serviços externos. Cada método verifica uma permissão declarada antes de acessar a porta correspondente.
- **Regras**:
  - manifesto exige id, versão e compatibilidade do core;
  - permissões e capabilities declaradas devem ser únicas;
  - plugins com ID já registrado são rejeitados;
  - serviço ausente ou permissão ausente falha explicitamente;
  - falha no setup remove o registro parcial;
  - o SDK não oferece acesso direto a recursos do host.
- **Alternativas rejeitadas**: entregar um objeto host irrestrito; confiar apenas em convenção documental; permitir mutação de manifesto após registro.
- **Consequências**: A composição do host permanece substituível e testável. Assinatura, migrations e extensões de dashboard ficam como metadados até haver política de instalação correspondente.
- **Evidências**: `packages/plugin-sdk/src/index.ts`, `test/plugin-sdk.test.js`, `npm run types:check`, `npm run build`.
