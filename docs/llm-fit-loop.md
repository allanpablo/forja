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

`commandArgs` preserva ordem, repetições e espaços dos argumentos. `timeoutMs` é opcional
(padrão 120000 ms, inteiro positivo até 2147483647). `reasoningEffort` é opcional e exclusivo
do Codex nesta versão: `low`, `medium`, `high`, `xhigh` ou `max`.

## Perfil GPT-6 no Codex

Adicione um perfil ao objeto `profiles` do arquivo existente, mantendo `version: 1`:

```json
{
  "codex-gpt6": {
    "provider": "codex",
    "model": "gpt-6-astra",
    "command": "codex",
    "roles": ["worker", "sdd-architect"],
    "taskTypes": ["implementation", "architecture", "review"],
    "privacy": "external",
    "enabled": true,
    "reasoningEffort": "high",
    "timeoutMs": 300000
  }
}
```

O modelo precisa estar disponível na conta autenticada da CLI. O doctor verifica instalação
e flags locais do Codex, mas não consulta acesso ao modelo (`modelAccess: "not-probed"`).
O perfil padrão continua usando o modelo configurado pelo operador, sem migração automática.

## Execução e evidência

```bash
forja llm:run --profile codex --task specs/pagamentos/spec.md --context .context/sprint-pack.md
forja llm:eval --scope model --id codex:default
```

`--context` pode ser repetido: os arquivos são lidos e enviados ao modelo em ordem, com caminhos
duplicados removidos. Arquivo ausente ou diretório causa erro antes de executar o provedor.
O hash cobre tarefa e contexto completos. O Forja não salva esses conteúdos nem a resposta no banco
ou na auditoria; salva modelo, duração, resultado, comando, referências e contagens de tokens.

Codex recebe o prompt por stdin e retorna eventos JSONL. O Forja extrai a resposta do agente,
`sessionId` e uso, sem devolver eventos de raciocínio como resposta final. Falhas explícitas,
JSONL inválido ou ausência de conclusão resultam em erro mesmo com exit zero do subprocesso.
O identificador da sessão é registrado no workspace e pode ser usado na retomada descrita abaixo.

Na saída JSON:

- `executionStatus`: `completed` ou `failed`; não comprova a qualidade da entrega.
- `validationStatus`: `accepted`, `rejected`, `inconclusive` ou `blocked`, conforme os checks independentes.
- `usage.source`: `provider` quando há telemetria; `estimated` para aproximação por bytes/4.
- `usage.cachedInputTokens`: presente quando informado pelo Codex.
- `costSource`: `estimated` com tabela local; `unknown` e `costUsd: null` sem preço conhecido.
- `errorCode`: distingue timeout, falha de subprocesso, falha do provedor e protocolo inválido.

Mesmo com tokens do provedor, o preço calculado não representa uma fatura: a tabela atual não
modela descontos de cache ou assinaturas. A saída antes usava zero para custo desconhecido;
consumidores devem tratar null. O recorder histórico ainda representa custo ausente como zero;
`cost:economy` consulta a tabela para identificar modelos sem preço. Origem dos tokens e sessão
estão na saída; a sessão também é registrada como metadados em `llm_session`, sem histórico textual.

`llm:eval` mantém métricas de execução; sua taxa de sucesso não equivale a tarefas aprovadas.
As métricas adicionais `validationAcceptedCount`, `validationRejectedCount`, `validationCoverageRate`
e `validationSuccessRate` medem as observações validadas. A última usa como denominador somente
aceitas + rejeitadas; inconclusivas e bloqueadas não são aprovações nem reprovações.

## Retomar uma sessão Codex

Use o `sessionId` retornado por uma execução anterior no mesmo workspace, projeto e perfil:

```bash
forja llm:run --profile codex-gpt6 --resume SESSION_ID --prompt "Continue a análise do requisito pendente"
```

O Forja envia apenas o novo prompt e os novos contextos selecionados. Não há replay, retry
automático nem escolha implícita da última sessão. O modo continua `read-only`. A sessão deve
continuar existindo no histórico da CLI do Codex. ID desconhecido ou mudança de projeto,
provedor, modelo declarado, executável, argumentos ou privacidade bloqueia antes da chamada.
Esforço e timeout podem mudar. A configuração global da CLI não é fingerprintada; use um modelo
explícito no perfil quando precisar fixá-lo. Não há coordenação de retomadas simultâneas da mesma
sessão nem garantia de que o modelo nunca repetirá uma ação.

## Formato e validação independente

O operador escolhe o schema da resposta e os checks antes de executar o modelo:

```bash
forja llm:run --profile codex-gpt6 --task specs/pagamentos/spec.md --output-schema result.schema.json --validation checks.json
```

Exemplo de `result.schema.json`:

```json
{
  "type": "object",
  "properties": { "summary": { "type": "string" } },
  "required": ["summary"],
  "additionalProperties": false
}
```

O schema é compilado localmente antes da chamada e usado para validar a resposta sem coerção.
São suportados draft-07 (padrão) e 2020-12 com `$schema` explícito. Refs remotos, schemas
assíncronos e formatos/plugins extras não são carregados. O Codex também recebe a flag nativa;
outros adaptadores recebem a instrução de responder JSON, com a mesma validação local.
O suporte de geração do provedor pode ser mais restrito que o JSON Schema local.

Exemplo de `checks.json` para verificar a suíte do projeto:

```json
{
  "version": 1,
  "checks": [
    { "name": "testes-do-projeto", "command": "npm", "args": ["test"], "timeoutMs": 120000 }
  ]
}
```

Checks são programas confiáveis escolhidos pelo operador, executados sequencialmente no diretório
do projeto com as permissões do processo Forja. Não são comandos escolhidos pelo modelo nem
executados dentro do sandbox Codex. A resposta chega por stdin; um script próprio pode verificar
seu conteúdo e critérios de aceite. `args` é um array, sem interpretação por shell.
O manifest aceita 1–20 checks, nomes únicos e timeout de 1–600000 ms por check (padrão 120000).

Formato válido sozinho retorna `validation.formatStatus: "accepted"` e `validationStatus:
"inconclusive"`. Com checks, todos precisam passar para marcar `accepted`. O primeiro check
reprovado encerra a validação. Schema reprovado impede executar os checks; falha do provedor
deixa a validação `blocked`.

Uma rejeição de validação retorna exit **2**, mantendo `executionExitCode: 0` e `executionStatus:
"completed"` se o modelo terminou normalmente. Falhas do modelo preservam seu código de saída.
Sem schema ou checks, o comportamento continua sendo execução com validação inconclusiva.

`llm_validation` guarda o ID da observação, hashes do schema, manifest e resposta, nomes dos
checks, exit codes, duração e hashes dos logs. Não guarda resposta nem logs textuais. O resultado
aprova somente os checks configurados; não equivale a merge ou aprovação geral de segurança.

## Segurança e escopo

- O adapter padrão do Codex é `read-only`; mudanças de arquivos continuam no runtime/sandbox
  supervisionado do Forja.
- `llm:probe` executa `--version` e, para Codex, os helps de `exec` e `exec resume`;
  informa também `features.resume` e `features.outputSchema`, sem consumir tokens ou enviar contexto.
- Recomendações são ordenadas por compatibilidade declarada e observações locais. O operador escolhe
  o perfil; não existe failover automático nem chamada direta a APIs nesta versão.
- O dashboard pode editar e exibir perfis, mas não executa modelos. A antiga rota de execução retorna
  `USE_FORJA_LLM_RUN`; use o CLI para que policy, auditoria e observabilidade sejam aplicadas.
- O histórico da CLI do provedor segue a configuração desse provedor, fora do armazenamento Forja.

Veja [visão e próximas etapas](llm-evolution.md) e
[documentação oficial do Codex](https://learn.chatgpt.com/docs/non-interactive-mode).
