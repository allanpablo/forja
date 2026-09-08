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

### Contexto pelo façade — `--engineer` (SPEC-048)

```bash
forja llm:run --profile codex --engineer "adicionar rate limit no login" --prompt "implemente"
```

`--engineer "<objetivo>"` roda `forja engineer "<objetivo>" --json` (contexto mínimo do domínio +
ADRs relevantes + `architecture:check` + risco + agentes recomendados + incidentes parecidos +
fluxo) e **embute o relatório no prompt**, antes do que você passar em `--prompt`/`--task` e antes
dos `--context`. Sem `--prompt`/`--task`, o próprio objetivo vira o prompt.

O hash cobre o prompt transmitido, incluindo o bloco do `engineer`. Em `contextRefs` fica só a
**referência** `engineer:<objetivo>` — o conteúdo do relatório **nunca** é persistido, igual ao
tratamento de `--context`. Se o façade sair com erro, o `llm:run` falha **antes** de chamar o
provedor com `errorCode: "ENGINEER_FAILED"`.

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

### Descobrir o `SESSION_ID` — `llm:sessions` (SPEC-048)

```bash
forja llm:sessions list                # id, projeto, quando, observação — mais recente primeiro
forja llm:sessions show <id> [--json]   # a sessão + a observação e a validação vinculadas
```

Somente leitura sobre `llm_session` — não abre o provedor nem a rede. É como recuperar o `id` do
`--resume` quando a saída da execução anterior se perdeu. `list --json` emite um array; `show`
emite um objeto; `id` desconhecido sai com código 1.

## Adaptador Claude (SPEC-050, ADR-0085)

O perfil `claude` tem paridade de retomada e formato com o Codex, dentro da mesma fronteira de
privacidade (`shell:false`, o Forja nunca lê API keys; prompt e contexto vão ao provedor, ao DB
só as refs).

```bash
forja llm:run --profile claude --prompt "Analise o requisito pendente"
forja llm:run --profile claude --resume SESSION_ID --prompt "Continue a análise"
```

- **Invocação**: `claude -p "<prompt>" --output-format json [--model <m>] [--resume <id>]`. A
  resposta é um **objeto JSON único** (não JSONL como o Codex); o Forja lê `result`,
  `session_id` e `usage` (`input_tokens`, `output_tokens`, `cache_read_input_tokens`). Formato
  inesperado, `is_error: true` ou `subtype != "success"` viram erro visível — nunca resposta
  silenciosa.
- **Retomada**: `RESUME_PROVIDERS = { codex, claude }`. `--resume` exige um id explícito e
  válido; as mesmas travas de fingerprint do Codex se aplicam (projeto, provedor, modelo
  declarado, executável, argumentos, privacidade). `llm:sessions` também lista sessões `claude`.
- **`--output-schema` com o perfil `claude`**: a validação é **local (Ajv), nunca uma garantia
  do provedor**. O `claude` CLI não tem geração estruturada nativa equivalente; ele recebe a
  instrução de responder JSON e a resposta é validada localmente pelo mesmo caminho do Codex.
  Por isso `llm:probe claude` reporta `features.outputSchema: false` e `features.resume: true`.
- **Custo**: o `total_cost_usd` do provedor **não** substitui a estimativa local de
  `model-pricing.json` — a evidência de custo continua vindo do preço declarado no Forja.

## Métricas e recomendação por custo/latência (SPEC-049)

`llm:eval` acrescenta às métricas do relatório:

- `durationMsP50` / `durationMsP95` — percentis da latência das observações do escopo.
- `costPerAcceptedTask` — `totalCost` dividido pelas observações com `validationStatus: "accepted"`
  (`0` quando nenhuma foi aceita, não `null` nem infinito).

`llm:recommend` passa a ponderar **latência** e **custo** além do fit declarado (`role`/`taskType`)
e da taxa de sucesso local. O bônus de latência/custo é limitado (soma no máximo 8 pontos): ele
desempata e refina entre pares próximos, **nunca inverte um fit declarado** (que vale 100+50).
Cada candidato ganha `evidence: { samples, medianDurationMs, meanCostUsd, successRate }` e o
`reasons` mostra `latency:p50=<ms>` e `cost:$<x>/run` — a recomendação deixa de ser um número opaco.

Sem amostras para um perfil, o score é o de fit puro (comportamento anterior). **Nenhum
percentual de melhoria é afirmado**: os eixos precisam de um baseline de observações reais de 30
dias antes de qualquer comparação numérica (ver [llm-evolution.md](llm-evolution.md)).

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
- `llm:probe` executa `--version` e, para Codex, os helps de `exec` e `exec resume`; para Claude,
  o `--help` (procura `--resume`). Informa `features.resume` e `features.outputSchema` (sempre
  `false` para Claude — validação de schema é local), sem consumir tokens ou enviar contexto.
- Recomendações são ordenadas por compatibilidade declarada e observações locais. O operador escolhe
  o perfil; não existe failover automático nem chamada direta a APIs nesta versão.
- O dashboard pode editar e exibir perfis, mas não executa modelos. A antiga rota de execução retorna
  `USE_FORJA_LLM_RUN`; use o CLI para que policy, auditoria e observabilidade sejam aplicadas.
- O histórico da CLI do provedor segue a configuração desse provedor, fora do armazenamento Forja.

Veja [visão e próximas etapas](llm-evolution.md) e
[documentação oficial do Codex](https://learn.chatgpt.com/docs/non-interactive-mode).
