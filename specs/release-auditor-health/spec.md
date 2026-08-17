# Spec: release-auditor-health

- **ID**: SPEC-022
- **Status**: done
- **Owner**: apk
- **Criado em**: 2026-08-17
- **Sprint alvo**: framework-root
- **ADRs relacionadas**: [ADR-0023](../../memory/90-decisions/0023-doctor-como-gate-do-nucleo.md) (saúde compartilhada), [ADR-0024](../../memory/90-decisions/0024-release-gate-tarball.md) (gate do tarball)

## 1. Problema
O ADR-0023 definiu `lib/core/health.ts` como fonte única da saúde do núcleo e previu três
consumidores: `tools:doctor`, `SessionStart` e Release Auditor. Os dois primeiros já consomem o
catálogo; o Release Auditor ainda manda executar apenas `release:check --publish`.

Esse gate prova a fronteira do tarball, mas não substitui a saúde do repositório. Ele não executa os
checks de coerência de documentação e topologia e só alcança parte da saúde indiretamente, por meio
de comandos de smoke na instalação limpa. Assim, o auditor pode aprovar o pacote sem ter obtido o
veredito da fonte que o ADR-0023 declarou canônica.

O agregador `check:all --full` também não substitui o procedimento de publicação: internamente ele
roda `release:check` em modo de desenvolvimento, no qual árvore suja é aviso. Pré-publicação exige
`release:check --publish`, que reprova se o tarball não corresponder a um commit.

## 2. Proposta de valor
Toda auditoria pré-publicação valida primeiro a saúde canônica do núcleo e depois a instalação limpa
do tarball, sem duplicar probes e sem enfraquecer o contrato de árvore limpa.

## 3. User stories
- **Como** Release Auditor, **quero** consumir o veredito de `tools:doctor` antes do gate do
  tarball, **para que** eu não aprove um release sobre um núcleo incoerente.
- **Como** mantenedor, **quero** que o procedimento aponte para os gates executáveis existentes,
  **para que** uma nova entrada em `CHECKS[]` seja herdada sem editar o agente.
- **Como** quem publica, **quero** preservar `release:check --publish`, **para que** uma árvore suja
  continue bloqueando a publicação.

## 4. Critérios de aceite (Definition of Done)
- [x] AC-1: `.claude/agents/release-auditor.md` manda executar `npm run tools:doctor` antes de
      `npm run release:check -- --publish`.
- [x] AC-2: Falha crítica do doctor reprova a auditoria e impede parecer de aprovação, com a
      correção fornecida pelo próprio check.
- [x] AC-3: O agente não reimplementa nenhum probe de `lib/core/health.ts`; o catálogo continua
      sendo a única fonte da definição de saúde.
- [x] AC-4: `release:check -- --publish` permanece obrigatório e separado. `check:all --full` não é
      apresentado como equivalente de pré-publicação enquanto não propagar o modo `publish`.
- [x] AC-5: A descrição canônica do papel em `AGENTS.md` reflete os dois gates e mantém explícito que
      o auditor não executa `npm publish`.
- [x] AC-6: Teste automatizado falha se o procedimento perder um dos comandos, inverter sua ordem
      ou remover `--publish`.

## 5. Escopo
**Dentro**:
- Procedimento e julgamento em `.claude/agents/release-auditor.md`.
- Descrição canônica do papel em `AGENTS.md`.
- Teste de contrato do procedimento.
- Atualização do candidato obsoleto em `memory/40-delivery/current-sprint.md`.

**Fora** (explícito, evita scope creep):
- Alterar `lib/core/health.ts`, seus checks ou severidades.
- Alterar `lib/core/release.ts` ou incorporar os checks de health ao catálogo de release.
- Fazer `check:all --full` propagar modo de publicação.
- Executar ou automatizar `npm publish`.
- Criar ADR: os contratos necessários já estão decididos nos ADRs 0023 e 0024.

## 6. NFRs / restrições
- **Performance**: o doctor roda antes do gate caro e pode interromper cedo uma auditoria inviável.
- **Segurança**: nenhuma correção e nenhuma publicação são executadas automaticamente.
- **Observabilidade**: o parecer cita o gate, o check que falhou e sua correção; não resume falha
  crítica como diagnóstico genérico.
- **Compatibilidade**: nomes e contratos dos comandos existentes permanecem intactos.

## 7. Riscos e mitigação
| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Duplicar checks entre health e release | M | A | Compor comandos existentes; zero probe novo |
| Trocar por `check:all --full` e aceitar árvore suja | M | A | Manter `release:check --publish` explícito e testado |
| Doctor tornar o release mais lento | B | B | Gate barato roda antes do empacotamento e falha cedo |
| Documentação do papel voltar a divergir | M | M | Teste de contrato cobre presença e ordem dos comandos |

## 8. Métricas de sucesso
Nos 30 dias após a entrega, 100% dos pareceres do Release Auditor registrados na trilha executam os
dois gates; nenhuma aprovação ocorre após `tools:doctor` crítico e nenhuma auditoria de publicação
usa `release:check` sem `--publish`.
