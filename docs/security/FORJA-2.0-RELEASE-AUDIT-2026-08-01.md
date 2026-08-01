# Auditoria de segurança e release — ForjaJS 2.0

**Data:** 2026-08-01  
**Escopo:** working tree local de `/home/apk/Documentos/GitHub/forja`  
**Parecer:** **NO-GO condicional**

## Objetivo

Verificar se a implementação atual atende aos gates mínimos de segurança,
contratos, testes, empacotamento e publicação sem declarar cobertura maior que
a efetivamente executada.

## Evidências executadas

| Verificação | Resultado |
| --- | --- |
| `tsc --noEmit` | passou |
| `next build` no dashboard | passou |
| `npm run build` | passou |
| `npm test -- --test-concurrency=1` | 267 testes passaram |
| `git diff --check` | passou |
| `npm audit --offline --omit=dev --audit-level=high` | passou: 0 vulnerabilidades |
| `gitleaks dir --redact ... .` após limpar `.next` | passou: 0 achados |
| `FORJA_WORKSPACE=/tmp/forja-workspace npm run release:check -- --publish` | falhou em `tree-clean` |

O gate de publicação também confirmou que instalação isolada, os 50 scripts
registrados, smoke commands, criação de spec no consumidor, `project:check`,
superfícies consumidoras, imports relativos e dependências declaradas passam.

## Bloqueios de release

### SEC-001 — dependências de produção vulneráveis — RESOLVIDO

`@nestjs/swagger` foi atualizado para `11.4.5`. Next e o dashboard foram
atualizados para `16.2.12`, com overrides compatíveis para `postcss@8.5.25` e
`sharp@0.35.3`. Uma instalação limpa (`npm install`) produziu uma árvore
consistente e `npm audit --offline --omit=dev --audit-level=high` retornou zero
vulnerabilidades. A atualização de major exige revisão funcional antes do GO
definitivo.

### REL-001 — árvore não limpa — CRITICAL para publicação

`release:check --publish` reprovou porque há 54 arquivos não commitados. O
tarball de publicação não corresponde a um commit revisável. É necessário
revisar o diff, executar os gates novamente e criar um commit intencional antes
de qualquer publicação. Nenhum `npm publish` foi executado.

### SEC-002 — Gitleaks em artefatos gerados — RESOLVIDO

Os 9 achados iniciais estavam em `apps/dashboard/.next/**`, incluindo
manifests/cache gerados pelo build. O conteúdo não foi exposto neste relatório.
Após ignorar e remover o diretório, a nova varredura encontrou zero achados.

## Cobertura e limitações

O preflight da auditoria de segurança marcou a execução como incompleta porque
não havia workers/delegação disponíveis. Portanto este documento é um parecer
manual focado nos gates de release, dependências, superfícies de autenticação,
proxy do dashboard, adapters e testes existentes; não é uma declaração de scan
exaustivo de cada arquivo nem substitui a varredura delegada completa.

O primeiro `release:check` no sandbox também encontrou `EPERM` ao iniciar
`git` e `EROFS` ao gravar a auditoria externa. A repetição fora do sandbox com
workspace temporário eliminou essas limitações e produziu o resultado
reprodutível descrito acima.

## Decisão

**NO-GO condicional para publicação.** As vulnerabilidades e os achados de
segredo foram resolvidos, mas a árvore ainda não está limpa e a atualização do
Next major precisa de revisão final. O gate de publicação continua bloqueado.

## Critérios para reabrir o GO

1. Revisar a migração do Next 15 para 16 e registrar compatibilidade.
2. Reexecutar `npm audit --omit=dev --audit-level=high` com acesso ao registry,
   além da confirmação offline já executada.
3. Limpar e reexecutar Gitleaks, confirmando zero segredo real fora de artefatos
   ignorados.
4. Executar `tsc --noEmit`, `npm run build`, `next build` no dashboard,
   `npm test -- --test-concurrency=1`, `git diff --check` e
   `npm run release:check -- --publish`.
5. Revisar o diff, criar commit e repetir a auditoria de segurança com cobertura
   completa/delegada quando os workers estiverem disponíveis.

## Handoff compacto

- **Objetivo:** decidir prontidão de release do ForjaJS 2.0.
- **Concluído:** gates funcionais executados; vulnerabilidades e falhas de
  publicação registradas; `.next` excluído do escopo Git.
- **Bloqueios:** SEC-001, REL-001, SEC-002.
- **Evidências:** comandos e resultados neste documento; `package-lock.json`;
  `release:check --publish`.
- **Próximo agente:** executor da correção de dependências, seguido por
  Governance/Release Auditor para repetir todos os gates.
