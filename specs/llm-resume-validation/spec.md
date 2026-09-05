# Spec: Retomada de sessões e validação independente

- **ID**: SPEC-038
- **Status**: done
- **Owner**: Allan Pablo / Codex
- **Criado em**: 2026-09-05
- **Sprint alvo**: Integrações LLM — etapa 2
- **ADRs relacionadas**: [ADR-0081](../../memory/90-decisions/0081-llm-resume-validation.md)

## Problema e valor

A etapa 1 retorna uma sessão e separa execução de validação, mas não permite continuar essa
sessão pelo Forja nem verificar respostas e requisitos com evidência independente.
Esta entrega torna possível continuar uma conversa conhecida e validar a saída usando contratos
JSON e comandos de teste escolhidos previamente pelo operador.

## Critérios de aceite

- [x] AC-1: --resume ID continua uma sessão Codex registrada pelo Forja no mesmo projeto e perfil; ID desconhecido, troca de configuração ou provedor incompatível falha antes da chamada.
- [x] AC-2: O Forja envia somente o novo prompt/contexto, sem replay ou retry automático, preservando sandbox read-only e approval never.
- [x] AC-3: --output-schema FILE compila JSON Schema localmente antes da chamada e valida a resposta sem coerção. Codex recebe também a opção nativa de schema.
- [x] AC-4: --validation FILE carrega checks explícitos antes da chamada; executa argv sem shell, com timeout e resposta por stdin; falha do modelo ou schema inválido não executa os checks.
- [x] AC-5: Aprovação de formato não aprova a tarefa. Sem checks independentes, validationStatus é inconclusive. Check reprovado retorna exit 2; execução do modelo continua distinguível.
- [x] AC-6: Persistir sessão e evidências (hashes, nomes, códigos, duração) sem prompt, resposta ou logs dos checks; métricas separam sucesso de execução de validação.
- [x] AC-7: Testes cobrem retomada real por fixture, isolamento de projeto/perfil, schemas, falhas, timeout e privacidade. Tipos, build e gates passam.

## Restrições e limites

CLIs continuam responsáveis por credenciais e histórico. A retomada depende de a sessão ainda
existir no provedor. Não há garantia de exatamente uma execução de ações pelo modelo, nem replay
pelo Forja. Esta etapa não coordena retomadas concorrentes da mesma sessão.
Checks são programas confiáveis escolhidos pelo operador; rodam nas permissões do processo Forja.
O modelo não escolhe comandos de validação. Aprovação é limitada aos checks configurados.
Schemas draft-07 e 2020-12 são aceitos via Ajv síncrono, sem refs remotos nem formatos/plugins extras.
Roteamento, benchmark e cache seguem nas próximas etapas da visão.
