# Spec: Integrações LLM com contexto e execução verificável

- **ID**: SPEC-037
- **Status**: done
- **Owner**: Allan Pablo / Codex
- **Criado em**: 2026-09-05
- **Sprint alvo**: Integrações LLM — etapa 1
- **ADRs relacionadas**: [ADR-0080](../../memory/90-decisions/0080-llm-execution-evidence.md)

## 1. Problema

llm:run registra caminhos de contexto sem enviar os arquivos. Codex usa saída textual e uma
opção de aprovação incompatível com exec da CLI instalada. Exit zero não comprova entrega válida.

## 2. Proposta de valor

Executar modelos com contexto selecionado, parâmetros explícitos e evidências sobre execução,
consumo e validação ainda pendente.

## 3. User stories

- Como desenvolvedor, quero enviar contexto por qualquer adaptador.
- Como operador, quero configurar GPT-6 e distinguir falhas do provedor de respostas válidas.
- Como mantenedor, quero testar contratos sem rede ou credenciais.

## 4. Critérios de aceite (Definition of Done)

- [x] AC-1: Arquivos --context são incluídos em ordem, sem duplicação; arquivo ausente impede iniciar o provedor.
- [x] AC-2: Perfis v1 seguem válidos; timeoutMs e reasoningEffort são opcionais e validados. Esforço exclusivo do Codex nesta etapa.
- [x] AC-3: Codex recebe prompt por stdin, JSONL, sandbox read-only e aprovação never via configuração; modelo explícito quando configurado.
- [x] AC-4: Eventos produzem resposta, sessionId e tokens do provedor; stream inválido, incompleto ou com falha não vira sucesso.
- [x] AC-5: Saída distingue execução de validação inconclusiva; estimativas identificadas e preço desconhecido não apresentado como zero confirmado.
- [x] AC-6: Forja persiste somente metadados; hash representa todo o prompt enviado.
- [x] AC-7: Testes locais cobrem contratos, contexto, falhas, consumo e perfis existentes; tipos e build passam.

## 5. Escopo

**Dentro**: etapa 1 da [visão](../../docs/llm-evolution.md): contexto, timeout, Codex estruturado,
exemplo GPT-6, compatibilidade de flags via doctor e documentação.

**Fora desta etapa**: chamadas pagas, retomada, schema arbitrário da resposta, validação de patches,
novos adaptadores HTTP, cache remoto e roteamento automático.

## 6. NFRs / restrições

Sem novas dependências ou shell. Autenticação permanece no provedor. Sem ampliar permissões.
Doctor não comprova acesso ao modelo. Conteúdo é devolvido ao operador, mas não persistido no Forja.

## 7. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Protocolo Codex muda | Ignorar eventos novos; exigir conclusão válida; fixtures documentadas |
| Custo confundido com cobrança | Rotular estimativa e preço desconhecido |
| CLI antiga | Doctor verifica flags de exec sem executar modelo |
| Codegraph ausente | Mapear chamadores com rg e registrar limitação |

## 8. Métricas de sucesso

Sete critérios cobertos nesta entrega. Em 30 dias medir falhas de integração. Qualidade da entrega
ainda depende de validação independente, prevista na próxima etapa.
