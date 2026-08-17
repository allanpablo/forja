# Modos de Operação

ForjaJS possui dois caminhos de uso. Eles não compartilham dados por acidente.

## Embedded: dentro de um projeto consumidor

Quando `forja` é invocado em um diretório com `package.json` fora do repositório do framework, o modo
é `embedded`. Memória, SQLite, specs, contexto, perfis LLM e auditoria ficam no próprio projeto:

```text
meu-app/
  memory/sqlite/universal.db
  specs/
  .context/
    forja-runs.jsonl
    llm-profiles.json
```

```bash
npx forja llm:profiles:init
npx forja sync:universal
npx forja spec:new pagamentos
npx forja gsd:plan pagamentos "Aprovar pagamentos de alto valor"
```

Use `FORJA_MODE=embedded` para forçar esse comportamento em um diretório sem `package.json`.

## Studio: fora de um projeto

O studio administra vários projetos num workspace externo. Os comandos de catálogo entram nesse modo
automaticamente: `workspace:init`, `project:new`, `project:list`, `project:upgrade`,
`workspace:project:check`, `init:project` e `demo:workspace`.

```bash
forja workspace:init
forja project:new meu-produto --ai claude,codex
forja project:list
```

O workspace é resolvido por `FORJA_WORKSPACE`, `~/.forjarc.json` ou `~/forja-workspace`. Use
`FORJA_MODE=studio` para forçar o modo externo em automações.

## Regra de decisão

| Situação | Modo | Onde ficam os dados |
| --- | --- | --- |
| Dependência instalada e comando executado na raiz do app | embedded | no próprio app |
| CLI global para criar/listar projetos | studio | workspace externo |
| `FORJA_WORKSPACE` definido | studio | path indicado pela variável |
| `FORJA_MODE` definido | explícito | conforme o modo escolhido |

O modo selecionado aparece como `project-cwd` ou `FORJA_WORKSPACE` nos diagnósticos do Forja.
