# ADR-0073 — Última milha: rollback, benchmark e plugins permissionados

## Status

Accepted

## Contexto

O ForjaJS já comprovava promoção de uma alteração em Git worktree, contexto com cache e isolamento de plugins, mas não possuía uma operação de rollback formal, um artefato de benchmark estável nem plugins oficiais registráveis.

## Decisão

Adicionar `rollback` ao contrato `SandboxBackend` e ao `SandboxEngine`, com estado terminal `rolled_back`. O backend Git reverte o patch binário na raiz do repositório através do mesmo `PatchApplier` usado na promoção. O benchmark de contexto emite JSON determinístico com checksum e estimativa documentada de tokens. GitHub e Docker são manifests oficiais mínimos; handlers de rede/daemon são injetados pelo host e nunca implícitos.

## Consequências

Rollback permanece explícito e auditável. A medição pode ser reproduzida em CI, mas tokens continuam uma estimativa bytes/4. Os plugins são extensíveis e permissionados, porém não afirmam uma integração externa até que um adapter real seja fornecido.
