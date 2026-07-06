# ADR-0018: Ferramentas de processo opcionais com detecção via tools:doctor

- **Status**: accepted
- **Data**: 2026-06-27
- **Autor(es)**: framework-team
- **Tags**: tooling, governance, dx, security

## Contexto
O harness pede `project:check`, `spec:check` e testes — mas todos manuais. Há ganhos práticos de processo parados por falta de mecânica:
- **Pré-commit** que rode os checks antes do commit (hoje dependem de disciplina humana).
- **Varredura de segredos** no gate de Governança (o projeto teve fase de hardening de segurança, mas não há scanner).
- **Busca/codemod estrutural** (codegraph dá relações; falta reescrita por padrão de AST).
- **Lint de docs**, dado que a documentação é central e enorme.

O risco é o oposto: exigir um zoológico de dependências que trava ambientes que não as têm.

## Decisão
Adotar ferramentas de processo como **camada opcional, detectada, nunca imposta**:

| Ferramenta | Papel no processo | Como entra |
|---|---|---|
| **codegraph** | code intelligence (relações, blast radius) | gate GSD (ADR-0017) |
| **gitleaks** | varredura de segredos no review | gate opcional de Governance |
| **ast-grep (`sg`)** | busca/codemod estrutural por AST | ferramenta do Worker para refactor |
| **lefthook** | pré-commit rodando `project:check`/`spec:check` | hook git opcional |
| **markdownlint-cli2** | lint da documentação | check opcional |

Mecânica: `scripts/tools-doctor.mjs` (`npm run tools:doctor`) detecta cada binário e reporta instalado/ausente + comando de instalação. Governança decide quais gates ativar conforme disponibilidade. Nenhum check novo é bloqueante por padrão quando a ferramenta falta.

## Alternativas consideradas
- **Tornar gitleaks/lefthook dependências obrigatórias** — rejeitada: quebra ambientes mínimos e CI alheios.
- **Não documentar nada e deixar cada projeto escolher** — rejeitada: perde a padronização que o objetivo pede ("próximos projetos usam esta estrutura").
- **Embutir as ferramentas como devDependencies npm** — rejeitada para binários nativos (codegraph, gitleaks, ast-grep) que não vivem bem no npm; ficam como detecção + instrução.

## Consequências
**Positivas**:
- Caminho claro de evolução do processo sem travar quem não tem as ferramentas
- Governança ganha checklist objetivo do que pode exigir
- `tools:doctor` vira o "raio-x" de prontidão do ambiente

**Negativas / Trade-offs**:
- Detecção sem imposição significa que o gate pode ser pulado num ambiente sem a ferramenta (aceito: documentado como degradação graciosa)

## Rastreamento
- Implementação: `scripts/tools-doctor.mjs`, `package.json`, `.lefthook.yml` (opcional)
- ADRs relacionadas: ADR-0017 (codegraph), ADR-0009 (hooks/token economy)
