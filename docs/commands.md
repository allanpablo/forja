# Referência de comandos

> Gerado por `forja docs:gen` a partir de `lib/core/registry.ts` — **não edite à mão.**
> 106 comandos · 34 skills distribuídas aos projetos gerados.

## workspace

| Comando | O que faz | Uso | Tier | Gates |
|---|---|---|---|---|
| `forja workspace:init` | Cria a estrutura base do workspace (~/forja-workspace) | `forja workspace:init` | core | — |
| `forja project:new` | Cria projeto no workspace e registra ficha em 30-projects/ | `forja project:new <nome> [-- --ai claude,copilot --skip-backend] [--template <nome>]` | core | workspace |
| `forja setup` | Rotina de primeiro uso: workspace:init + sync:universal, atrás de confirmação | `forja setup [--yes]` | core | — |
| `forja project:list` | Lista projetos do workspace | `forja project:list` | advanced | — |
| `forja project:upgrade` | Traz peças novas de scaffold e religa a IA num projeto (ou --all) — aditivo; --apply aplica | `forja project:upgrade [--apply] [--project <path> \| --all] [--json]` | advanced | — |
| `forja workspace:project:check` | Valida padrões em um projeto do workspace | `forja workspace:project:check` | advanced | workspace |
| `forja project:templates` | Lista os boilerplates: quais são templates validados (project:new --template) e quais são referência | `forja project:templates [--json]` | advanced | — |
| `forja project:wire` | Conecta o projeto à inteligência do Forja: instruções nativas, hooks, sub-agents e MCP | `forja project:wire [--check] [--ai claude,codex,gemini,copilot] [--json]` | advanced | — |

## sdd

| Comando | O que faz | Uso | Tier | Gates |
|---|---|---|---|---|
| `forja spec:new` | Cria specs/<slug>/spec.md a partir do template | `forja spec:new <slug>` | core | — |
| `forja spec:plan` | Deriva plan.md de uma spec | `forja spec:plan <slug>` | core | — |
| `forja spec:tasks` | Decompõe plan.md em tasks.md | `forja spec:tasks <slug>` | core | — |
| `forja spec:trace` | Critérios de aceite × testes que os citam (SPEC-NNN AC-N): cobertos, sem teste e órfãos | `forja spec:trace [slug] [--strict] [--json]` | advanced | — |
| `forja spec:check` | Valida completude da spec (gate de governança) | `forja spec:check [slug] [--json]` | core | — |
| `forja spec:set-status` | Atualiza o status de um artefato SDD | `forja spec:set-status` | advanced | — |

## gsd

| Comando | O que faz | Uso | Tier | Gates |
|---|---|---|---|---|
| `forja status` | Retrato único do estado: workspace, sprint, corrida, specs, runs, handoffs | `forja status [--json]` | core | workspace-warn |
| `forja next` | A próxima ação recomendada + o comando exato para executá-la | `forja next [--json]` | core | workspace-warn |
| `forja orchestrate` | Abre uma corrida: a cadeia SDD/GSD como máquina de estados guardada por gates | `forja orchestrate "<objetivo>" --slug <slug>` | core | — |
| `forja orchestrate:status` | O estado da corrida: etapas feitas, aberta, gates e vereditos | `forja orchestrate:status <slug>` | core | — |
| `forja orchestrate:advance` | Roda o gate da etapa aberta; verde → abre a próxima; vermelho → trava com o parecer | `forja orchestrate:advance <slug>` | core | — |
| `forja gsd:plan` | Cria runbook GSD em .context/ | `forja gsd:plan` | advanced | — |
| `forja gsd:handoff` | Registra handoff GSD padronizado (ADR-0005) | `forja gsd:handoff` | advanced | — |
| `forja gsd:check` | Valida gates básicos do runbook GSD | `forja gsd:check` | advanced | — |
| `forja hermes:handoff` | Registra handoff ADR-0005 bruto via agent-router | `forja hermes:handoff` | advanced | — |
| `forja agent:route` | Roteia/inspeciona handoffs (agent-router) | `forja agent:route <append\|list [--open] [--mine\|--project <nome>] [--to <papel>]\|show\|done\|in_progress\|cancel\|archive\|schema> [args]` | advanced | — |
| `forja sprint:start` | Inicia sprint | `forja sprint:start` | advanced | — |
| `forja sprint:status` | Status da sprint atual | `forja sprint:status` | advanced | — |
| `forja sprint:complete` | Encerra sprint | `forja sprint:complete` | advanced | — |

## design

| Comando | O que faz | Uso | Tier | Gates |
|---|---|---|---|---|
| `forja design:check` | Valida brief visual antes do handoff | `forja design:check` | advanced | — |
| `forja design:select` | Sugere referências design-md por superfície | `forja design:select` | advanced | — |

## code

| Comando | O que faz | Uso | Tier | Gates |
|---|---|---|---|---|
| `forja code:check` | Valida índice codegraph (worktree + freshness) | `forja code:check` | advanced | — |
| `forja code:impact` | Chamadores + blast radius de um símbolo | `forja code:impact` | advanced | — |
| `forja graph:sync` | Indexa arquivos rastreáveis do workspace no GraphLoop por checksum | `forja graph:sync` | advanced | workspace-warn |
| `forja drift:check` | Reindexa e sinaliza relações verified que a extração atual não reproduz mais (SPEC-030). --domain <d> restringe; --all roda por projeto do workspace | `forja drift:check [--domain <d>] [--all]` | advanced | workspace-warn |
| `forja adr:list` | Lista ADRs (memory/90-decisions/) com status, via Engineering Graph (SPEC-032) | `forja adr:list` | advanced | workspace-warn |
| `forja adr:show` | Mostra uma ADR: status, arquivo, constraints (SPEC-032) | `forja adr:show` | advanced | workspace-warn |
| `forja adr:impact` | Componentes/documentos alcançáveis a partir de uma ADR, via GraphLoop.impact (SPEC-032) | `forja adr:impact` | advanced | workspace-warn |
| `forja adr:graph` | Subgrafo (JSON) de nós ADR/SPEC + vizinhança (SPEC-032) | `forja adr:graph` | advanced | workspace-warn |
| `forja architecture:compile` | ADRs (## Constraints) → .context/architecture/constitution.json (SPEC-033) | `forja architecture:compile` | advanced | — |
| `forja architecture:check` | Verifica o código real contra a Architecture Constitution compilada (SPEC-033) | `forja architecture:check` | advanced | workspace-warn |
| `forja architecture:status` | Resumo da Constitution: regras active/proposed, última compilação (SPEC-033) | `forja architecture:status` | advanced | — |
| `forja architecture:explain` | Explica uma regra da Constitution: ADR de origem, severidade, texto original (SPEC-033) | `forja architecture:explain` | advanced | — |
| `forja architecture:approve` | Promove uma regra proposed a active via ApprovalLedger (SPEC-033) | `forja architecture:approve` | advanced | — |
| `forja risk:assess` | Score de risco 0-100 (7 fatores) sobre o diff de um ref (default: working tree) (SPEC-034) | `forja risk:assess` | advanced | workspace-warn |
| `forja risk:explain` | Reexibe um assessment de risco já calculado, com todos os fatores (SPEC-034) | `forja risk:explain` | advanced | — |
| `forja evidence:show` | View agregada de evidência de um run: intent, agente, testes, aprovações (SPEC-035) | `forja evidence:show` | advanced | workspace-warn |
| `forja engineer` | Façade: contexto + ADRs relevantes + architecture:check + risco + fluxo recomendado | `forja engineer "<objetivo>" [--ref <ref>] [--role <role>] [--json]` | core | workspace-warn |
| `forja agent:register` | Registra/atualiza um agente (role/provider/model/capabilities/domains) (SPEC-036) | `forja agent:register <id> --role <role> [--provider <p>] [--model <m>] [--capabilities <c1,c2>] [--domains <d1,d2>] [--max-files <n>] [--max-cost-usd <n>]` | advanced | workspace-warn |
| `forja agent:list` | Lista agentes registrados, com trustLevel se já pontuados (SPEC-036) | `forja agent:list` | advanced | workspace-warn |
| `forja agent:show` | Detalhe de um agente registrado (SPEC-036) | `forja agent:show` | advanced | workspace-warn |
| `forja agent:score` | Computa e persiste trustLevel/autonomyLevel a partir de Observation reais (SPEC-036) | `forja agent:score <id> [--domain <d>]` | advanced | workspace-warn |
| `forja agent:history` | Observations de um agente, mais recentes primeiro (SPEC-036) | `forja agent:history` | advanced | workspace-warn |
| `forja agent:recommend` | Ranking de agentes registrados por adequação a um papel/domínio — informação, não atribuição (SPEC-037) | `forja agent:recommend --role <role> [--domain <d>]` | advanced | workspace-warn |
| `forja agent:monitor` | Compara comportamento recente de um agente contra a linha de base histórica — informação, não bloqueio (SPEC-040) | `forja agent:monitor <id> [--window-hours <n>]` | advanced | workspace-warn |
| `forja incident:record` | Grava um incidente no Engineering Graph (SPEC-041) | `forja incident:record --title <t> [--description <d>]` | advanced | workspace-warn |
| `forja incident:list` | Incidentes registrados, mais recentes primeiro (SPEC-041) | `forja incident:list` | advanced | workspace-warn |
| `forja incident:similar` | Sugere incidentes parecidos por palavra-chave — sugestão, nunca aplicação automática (SPEC-041) | `forja incident:similar` | advanced | workspace-warn |
| `forja simulate` | Testa+arquitetura+risco de um ref num worktree isolado, nunca promove | `forja simulate <ref> [--command "npm test"] [--json]` | advanced | workspace-warn |
| `forja provenance:record` | Extrai proveniência (arquivo↔agente) de um RuntimeRun já persistido (SPEC-039) | `forja provenance:record` | advanced | workspace-warn |
| `forja blame` | Histórico de proveniência de um arquivo — granularidade de arquivo, não linha (SPEC-039) | `forja blame` | advanced | workspace-warn |
| `forja sbom` | AI-SBOM: relatório de proveniência agregado por agente (SPEC-039) | `forja sbom` | advanced | workspace-warn |
| `forja code:context` | Pacote de contexto mínimo de um domínio: o mapa (context.md), + código com --code (ADR-0009) | `forja code:context <domínio> [termo] [--code] [--full] [--project <path>]` | advanced | — |
| `forja code:index` | Inicializa índice codegraph | `forja code:index` | advanced | — |
| `forja code:sync` | Sincroniza índice codegraph | `forja code:sync` | advanced | — |
| `forja code:status` | Status do índice codegraph | `forja code:status` | advanced | — |
| `forja code:query` | Consulta o índice codegraph | `forja code:query` | advanced | — |

## memoria

| Comando | O que faz | Uso | Tier | Gates |
|---|---|---|---|---|
| `forja sync:universal` | Reindexa a memória universal (SQLite FTS5) | `forja sync:universal` | core | workspace-warn |
| `forja query:universal` | Busca FTS5 na memória universal | `forja query:universal "<termo>"` | core | workspace-warn |
| `forja memory:compress` | Arquiva runs antigos e compacta memória de projeto | `forja memory:compress` | advanced | — |
| `forja memory:vacuum` | Comprime e limpa memória (archive + VACUUM) | `forja memory:vacuum` | advanced | — |
| `forja memory:schema` | Garante schema do SQLite de memória | `forja memory:schema` | advanced | — |
| `forja memory:extract` | Extrai conhecimento global da memória | `forja memory:extract` | advanced | — |
| `forja memory:audit` | Coerência mapa↔código: mapa não cita código morto (falha) + módulo sem mapa (aviso). SPEC-017 | `forja memory:audit` | advanced | — |

## contexto

| Comando | O que faz | Uso | Tier | Gates |
|---|---|---|---|---|
| `forja context:smart` | Gera smart-context (3 modos: global \| domain \| task) | `forja context:smart [--mode global\|domain\|task] [--domain <d>] [--task <termo>] [--keyword <k>] [--project <nome>] [--full-context]` | core | workspace-warn |
| `forja context:budget` | Orçamento de tokens do contexto | `forja context:budget` | advanced | — |
| `forja context:sprint` | Pacote de contexto da sprint | `forja context:sprint` | advanced | — |
| `forja agent:brief` | Brief de contexto para um agente | `forja agent:brief` | advanced | — |
| `forja catalog:assets` | Catálogo de assets do repo | `forja catalog:assets` | advanced | — |
| `forja catalog:manifests` | Catálogo de manifests | `forja catalog:manifests` | advanced | — |
| `forja token:benchmark` | Benchmark de consumo de tokens | `forja token:benchmark` | advanced | — |
| `forja token:economy` | Economia de token: eixos arquitetura + memória; --project mede seus domínios reais | `forja token:economy [--project <path>] [--json]` | advanced | — |
| `forja benchmark:context` | Benchmark JSON determinístico de baseline, contexto mínimo, checksum e cache | `forja benchmark:context` | advanced | — |

## llm

| Comando | O que faz | Uso | Tier | Gates |
|---|---|---|---|---|
| `forja llm:profiles:init` | Cria perfis de adapters LLM no workspace | `forja llm:profiles:init` | advanced | workspace |
| `forja llm:doctor` | Verifica adapters LLM configurados sem usar credenciais | `forja llm:doctor` | advanced | workspace |
| `forja llm:probe` | Executa probe seguro de disponibilidade dos adapters LLM | `forja llm:probe` | advanced | workspace |
| `forja llm:recommend` | Recomenda perfil LLM por papel, tarefa e evidência local | `forja llm:recommend [--role <papel>] [--task <tarefa>] [--json]` | advanced | workspace |
| `forja llm:run` | Executa um perfil LLM e registra observação normalizada. --engineer "<objetivo>" monta o contexto pelo façade | `forja llm:run [--profile <perfil>] [--task <caminho>] [--prompt <texto>] [--engineer "<objetivo>"] [--context <caminho>...] [--output-schema <arquivo>] [--validation <arquivo>] [--resume <id>] [--json]` | advanced | workspace |
| `forja llm:sessions` | Lista/mostra sessões LLM registradas (o SESSION_ID de llm:run --resume) — somente leitura (SPEC-048) | `forja llm:sessions <list\|show> [id] [--json]` | advanced | workspace |
| `forja llm:eval` | Avalia execuções LLM com métricas determinísticas | `forja llm:eval [--scope <escopo>] [--id <id>] [--json]` | advanced | workspace |
| `forja eval:agents` | Avalia agentes reais (Claude, Codex) numa suíte de tarefas do Forja, em projeto descartável — custa | `forja eval:agents --agent claude\|codex [--case a,b] [--model m] [--budget-usd n] [--timeout s] [--keep] [--list] [--json]` | advanced | — |
| `forja cost:economy` | Custo real acumulado (USD) das execuções LLM registradas, por modelo — tabela de preço local | `forja cost:economy [--json]` | advanced | workspace |

## governanca

| Comando | O que faz | Uso | Tier | Gates |
|---|---|---|---|---|
| `forja project:check` | Standards check do framework (pre-commit) | `forja project:check` | core | — |
| `forja tools:doctor` | Raio-x do núcleo (gate, exit 1) + ferramentas de processo | `forja tools:doctor [--json]` | core | — |
| `forja hook:session-start` | Hook SessionStart: briefing de specs, handoffs e saúde do núcleo para a IA | `forja hook:session-start` | advanced | — |
| `forja hook:user-prompt` | Hook UserPromptSubmit: injeta o contexto da spec citada no prompt | `forja hook:user-prompt` | advanced | — |
| `forja hook:session-memory` | Hook Stop/PreCompact: grava o checkpoint da sessão em memory/60-runs/sessions/ | `forja hook:session-memory` | advanced | — |
| `forja demo:autonomy` | Executa a prova offline de autonomia supervisionada com Git worktree real | `forja demo:autonomy` | advanced | — |
| `forja demo:workspace` | Cria um workspace isolado e rotulado para demonstração do produto | `forja demo:workspace [--path <diretório>] [--json]` | advanced | — |
| `forja release:check` | Gate do tarball: instala limpo e prova que o pacote funciona (ADR-0024). --publish para o modo estrito | `forja release:check [--publish]` | advanced | — |
| `forja project:smoke` | Gate do projeto gerado: gera isolado e prova que é coerente. --full instala e builda o backend; --ai <lista> valida as instruções nativas | `forja project:smoke [--full] [--ai claude,copilot,gemini,codex] [--template <nome>]` | advanced | — |
| `forja check:all` | Roda a bateria inteira de gates e dá um veredito (SPEC-020). --full inclui tarball e build | `forja check:all [--full] [--with-architecture] [--with-drift]` | advanced | — |
| `forja project:dashboard` | Gera dashboard estático de status | `forja project:dashboard` | advanced | — |
| `forja audit:sync` | Projeta a trilha de auditoria (.jsonl) numa tabela consultável (SPEC-014) | `forja audit:sync` | advanced | — |
| `forja audit:query` | Consulta a auditoria: --failed, --cmd <x>, --since 7d | `forja audit:query [--failed] [--cmd <comando>] [--gate <gate>] [--since <janela>]` | advanced | — |
| `forja docs:gen` | Regenera docs/commands.md a partir do registry — a referência completa de comandos (SPEC-055) | `forja docs:gen` | advanced | — |
| `forja quality:coverage` | Roda a suíte com a cobertura nativa do Node e cobra o piso versionado (SPEC-056) — exit 2 abaixo do piso | `forja quality:coverage [--json]` | advanced | — |
| `forja governance:dashboard` | Gera um painel HTML estático de governança (gates, SDD, auditoria) — leitura, sem servidor | `forja governance:dashboard` | advanced | — |
