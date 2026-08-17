# ADR-0074: LLM Fit Loop por adapters de CLI

- **Status**: proposed
- **Data**: 2026-08-17
- **Autor(es)**: Allan Pablo
- **Tags**: llm, cli, observability, local-first, security

## Contexto

O ForjaJS já preserva `Observation`, avaliação determinística e execução supervisionada, mas o
roteamento de LLMs era uma configuração estática de dashboard, com paths locais e sem evidência de
qual perfil funcionou para cada papel ou tarefa. Chamar SDKs diretamente concentraria credenciais no
framework e contrariaria a operação local-first. A escolha precisa continuar explícita, auditável e
independente do fornecedor.

## Decisão

Adotar perfis de LLM no workspace e adapters de CLI sem shell. O Forja registra somente metadata de
execução e hashes: perfis, executável, modelo, tipo de tarefa, duração, tokens estimados e resultado.
Credenciais, prompts e respostas não são persistidos. `llm:recommend` ordena perfis por compatibilidade
declarada e observações locais; não altera a rota automaticamente.

## Alternativas consideradas

- **SDKs/API keys de cada fornecedor no core**: rejeitada porque amplia a superfície de segredo,
  acopla releases aos fornecedores e exclui CLIs autenticadas pelo operador.
- **Manter o routing no dashboard**: rejeitada porque uma superfície opcional não pode ser o caminho
  de configuração, execução e auditoria de uma operação CLI-first.
- **Failover automático por custo ou latência**: rejeitada no MVP porque troca silenciosamente a
  fronteira de privacidade e não possui evidência suficiente por tipo de tarefa.

## Consequências

**Positivas**:
- Conectores de Codex, Claude, Gemini, Ollama e executáveis compatíveis usam um contrato único.
- A recomendação usa dados persistidos e a avaliação existente, sem uma LLM julgando outra LLM.
- Perfis são portáveis dentro do workspace e não expõem API keys.

**Negativas / Trade-offs**:
- Cada CLI continua responsável por autenticação, formato de custo e disponibilidade.
- Tokens são estimados por bytes/4 quando o adapter não fornece telemetria do provedor.
- A execução inicial é de leitura; mudanças de arquivos permanecem no runtime/sandbox supervisionado.
- O dashboard legado perde a execução direta de modelos; ele continua apenas como leitura/edição de
  perfis do workspace.

## Rastreamento

- Implementação: `packages/llm/src/index.ts`, `scripts/llm-fit.ts`, `lib/core/registry.ts`, `dashboard/server/`
- Testes: `test/llm-fit.test.js`
- Documentação: `docs/llm-fit-loop.md`, `skills/llm-provider-routing/SKILL.md`
- ADRs relacionadas: ADR-0037, ADR-0049, ADR-0052, ADR-0059
