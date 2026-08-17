# LLM Fit Loop

O Forja integra CLIs de LLM sem receber, persistir ou imprimir credenciais. Um perfil descreve apenas
o adapter local, a finalidade e a fronteira de privacidade. Cada execução gera uma observação SQLite;
o roteamento continua explícito e recomendado por evidência, nunca automático no MVP.

## Primeiro uso

```bash
forja workspace:init
forja llm:profiles:init
forja llm:doctor
forja llm:probe codex
forja llm:recommend --role sdd-architect --task architecture
```

Edite `<workspace>/.context/llm-profiles.json` para habilitar somente os adapters realmente instalados.
`command` aceita um executável; argumentos fixos vão em `commandArgs`. O processo é criado com
`shell: false` e o Forja não lê API keys.

## Execução e evidência

```bash
forja llm:run --profile codex --task specs/pagamentos/spec.md --context .context/sprint-pack.md
forja llm:eval --scope model --id codex:default
```

`llm:run` calcula hashes e tokens estimados, mas não salva o prompt ou a resposta no banco. Salva
modelo, duração, resultado, comando, referências de contexto e métricas no armazenamento de
observações. `llm:eval` usa regras determinísticas do `EvaluationEngine` para medir sucesso,
retrabalho, custo, tempo e uso de contexto.

## Segurança e escopo

- O adapter padrão do Codex é `read-only`; mudanças de arquivos continuam no runtime/sandbox
  supervisionado do Forja.
- `llm:probe` só executa `--version`; não consome tokens nem envia conteúdo do projeto.
- Recomendações são ordenadas por compatibilidade declarada e observações locais. O operador escolhe
  o perfil; não existe failover automático nem chamada direta a APIs nesta versão.
- O dashboard pode editar e exibir perfis, mas não executa modelos. A antiga rota de execução retorna
  `USE_FORJA_LLM_RUN`; use o CLI para que policy, auditoria e observabilidade sejam aplicadas.
