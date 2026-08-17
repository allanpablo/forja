# ForjaJS: Factsheet de Produto

**Versão de referência:** 2.0.3 com o LLM Fit Loop em desenvolvimento.

## Mensagem central



## Para quem é

- Desenvolvedores solo e times pequenos que usam IA como força principal de implementação.
- Tech leads que precisam limitar autonomia sem desacelerar o fluxo de entrega.
- Produtos que precisam manter decisões, specs e evidências entre sessões e entre ferramentas de IA.

Não é uma IDE, uma hospedagem de agentes, uma plataforma SaaS multi-tenant nem substitui Git.

## Problema que resolve

Agentes de desenvolvimento são bons em uma sessão, mas normalmente não têm memória persistente,
processo verificável ou uma fronteira confiável entre sugestão e ação. Isso resulta em contexto
repetido, decisões perdidas, mudanças sem validação e autonomia baseada em confiança.

O ForjaJS adiciona a camada operacional ao redor do agente:

```text
contexto e memória -> plano -> policy/aprovação -> execução isolada -> validação -> evidência
```

## O núcleo funcional

| Capacidade | O que entrega | Prova operacional |
| --- | --- | --- |
| CLI e Capability Registry | Capacidades versionadas, descobríveis e com entrada/saída validadas | `forja capabilities:list` e `forja capability:execute` |
| Policy Engine | Allow, deny, limites e aprovação para ações por risco | contratos e testes de policy/runtime |
| Runtime supervisionado | Execução com estado, checkpoints, pausa, retomada, retry limitado e orçamento | `test/runtime.test.js` |
| SDD/GSD | Spec, plano, tarefas, handoffs de sete campos e gates de governança | `forja spec:*`, `forja gsd:*`, `forja orchestrate:*` |
| Memória e contexto | SQLite local, evidências, contexto selecionado por orçamento e cache | `forja context:smart`, `forja benchmark:context` |
| GraphLoop | Grafo incremental de documentos, símbolos, relações e evidências | `forja graph:sync`, impacto e consultas GraphLoop |
| Sandbox Git | Worktree isolada, diff, promoção explícita e rollback | `forja demo:autonomy` |
| Validator | Resultado aceito, rejeitado, inconclusivo ou bloqueado por checks/evidências | `packages/validator` e testes de runtime |
| Observabilidade e evals | Observações locais, custo/tokens quando fornecidos e métricas determinísticas | `EvaluationEngine` e `llm:eval` |
| MCP e SDK | Acesso programático à mesma capability registry | `forja mcp:start` e `packages/sdk` |
| Plugins | Fronteiras permissionadas para extensões | manifests GitHub/Docker e Plugin SDK |

## Fluxo de entrega

```text
briefing -> spec -> plano -> tarefas -> implementação -> validação -> governança
                 |                                   |
                 +-- contexto mínimo e evidências ----+
```

O motor `orchestrate` mantém essa sequência como máquina de estados. Uma etapa só avança depois do
artefato exigido e do gate correspondente. O agente ou humano executa o trabalho; o ForjaJS controla
o processo, a política e a evidência.

## LLM Fit Loop

O ForjaJS não exige um único fornecedor de modelo. O LLM Fit Loop integra CLIs já autenticadas pelo
operador, como Codex, Claude, Gemini, Ollama e executáveis compatíveis.

```bash
forja llm:profiles:init
forja llm:doctor
forja llm:recommend --role worker --task implementation
forja llm:run --profile codex --task specs/minha-feature/spec.md
forja llm:eval --scope model --id codex:default
```

O ciclo registra modelo, duração, resultado, referências de contexto e tokens estimados. A seleção é
uma recomendação explicável, não failover automático. Credenciais ficam na CLI do fornecedor; prompts
passados por `--prompt` são mascarados da trilha de auditoria.

## Segurança e privacidade

- **Local-first:** SQLite, filesystem e Git local são as dependências padrão do fluxo comprovado.
- **Aprovação explícita:** ações de risco podem exigir uma aprovação persistida antes da execução.
- **Sandbox:** alterações são feitas em worktree e só chegam ao repositório por promoção explícita.
- **Rollback:** uma promoção pode ser revertida por operação auditável.
- **Sem shell para adapters LLM:** executáveis recebem `argv` estruturado.
- **Evidência separada de afirmação:** validação e GraphLoop carregam status e referências de prova.

## Demonstrações que sustentam a mensagem

| Demonstração | O que mostra |
| --- | --- |
| `forja demo:autonomy` | fixture externa, Git worktree real, aprovação, teste, diff, promoção, SQLite, GraphLoop e handoff |
| `forja benchmark:context` | baseline, contexto selecionado, checksum, cache e estimativa de economia de tokens |
| `forja mcp:start` | transporte MCP JSON-RPC por stdio e tools derivadas do registry |
| `forja llm:profiles:init` + `llm:run` | adapters de LLM sem API key no framework e observação persistida |
| `forja demo:workspace` | workspace isolado e rotulado para demonstração de CLI e dashboard sem dados reais |

## Mensagens prontas para marketing

### Headline

**Pare de tratar agentes de código como chats descartáveis. Opere-os como um time de engenharia.**

### Subheadline

ForjaJS adiciona memória, contexto econômico, política, sandbox e evidência ao fluxo de agentes de
desenvolvimento, sem exigir nuvem nem prender seu time a um provedor de LLM.

### Diferenciais em três pontos

1. **Memória que sobrevive:** contexto, decisions e handoffs continuam entre sessões e ferramentas.
2. **Autonomia com limite:** policy, orçamento, sandbox e aprovação decidem o que pode acontecer.
3. **Entrega comprovável:** validação independente, evidências e auditoria substituem “o agente disse
   que terminou”.

### Elevator pitch

ForjaJS é o control plane local-first para times que desenvolvem software com agentes de IA. Ele não
tenta substituir o modelo: organiza o processo ao redor dele, conectando contexto, execução
supervisionada, governança e memória em uma trilha auditável.

## Claims permitidos

- “CLI-first e local-first para operação de agentes de desenvolvimento.”
- “Memória SQLite, contexto selecionado por orçamento e evidências persistentes.”
- “Execução supervisionada com policy, aprovação, sandbox Git e rollback explícito.”
- “Integração multi-LLM por adapters de CLI, sem API keys armazenadas no ForjaJS.”
- “MCP, SDK, REST/SSE e CLI sobre contratos versionados.”

## Claims a evitar por enquanto

- “Autonomia total” ou “agentes trabalham sozinhos sem supervisão”.
- “Integração completa com GitHub ou Docker”: hoje existem boundaries/plugin manifests permissionados,
  não clientes externos completos.
- “Economia fixa de tokens”: o benchmark usa proxy bytes/4 e varia por projeto/contexto.
- “Dashboard de produção”: o dashboard 2.x é parcial e a interface legada é opcional.
- ROI, redução de bugs, cobertura ou velocidade com percentuais sem telemetria do usuário.

## Estado das superfícies visuais

- **Dashboard 2.x:** superfície de supervisão parcial via API; não é requisito do fluxo CLI-first.
- **Dashboard React/Vite legado:** útil para demonstração local de telas e navegação. Em 2026-08-17,
  ele inicia em Node 24 com `better-sqlite3` 12 e expõe API local em `127.0.0.1:7777`; o frontend
  Vite fica em `http://127.0.0.1:5173`. Um workspace sem projetos ou handoffs mostra coleções vazias,
  não dados de demonstração inventados.
- O dashboard não executa LLMs diretamente: essa ação foi direcionada para `forja llm:run` para manter
  policy, auditoria e privacidade.

## Referências de engenharia

- Visão: `docs/vision/FORJA-2.0-VISION.md`
- Arquitetura: `docs/architecture/FORJA-2.0-ARCHITECTURE.md`
- Auditoria de implementação: `docs/2x/IMPLEMENTATION-AUDIT.md`
- LLM Fit Loop: `docs/llm-fit-loop.md`
- Roteiro de demonstração: `docs/produto/roteiro-demo.md`
- Decisões: `memory/90-decisions/`
