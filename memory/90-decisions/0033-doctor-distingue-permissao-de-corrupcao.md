# ADR-0033: `memory-db` distingue permissão/lock de corrupção

- **Status**: accepted
- **Data**: 2026-07-23
- **Autor(es)**: Allan Pablo
- **Tags**: doctor, memory, diagnostics, sqlite

## Contexto

O check `memory-db` (`lib/core/health.ts`), consumido por `tools:doctor` e pelo hook
`SessionStart`, abria `universal.db` e tratava **qualquer** exceção do `better-sqlite3` como
corrupção:

```ts
} catch (err) {
  return {
    status: 'fail',
    detail: `... (${asErrno(err).code}) — provavelmente corrompido`,
    fix: 'npm run sync:universal',
  };
}
```

O `err.code` — que já distingue os casos — estava impresso no `detail`, mas não decidia nada.
Num ambiente sem permissão de escrita (sandbox, FS read-only, diretório protegido) o driver
lança `SQLITE_CANTOPEN`, e o doctor diagnosticava "provavelmente corrompido" prescrevendo
`sync:universal`. A prescrição é ativamente errada: `sync:universal` **escreve** no banco — no
mesmo ambiente ele reencena o `CANTOPEN` sem curar nada, e ainda confunde o operador levando-o a
"reindexar" um banco íntegro. Reportado a partir de uma sessão real em sandbox restrito.

É a violação do princípio 1 do próprio `health.ts` ("nunca colapsar causas distintas num
booleano"), a mesma classe do bug de ABI que motivou a SPEC-009 — sobrevivendo dentro do arquivo
escrito para fechá-la.

## Decisão

Classificar a falha de abertura por `err.code`, uma causa por prescrição:

- `SQLITE_CANTOPEN` / `EACCES` → `fail`, **permissão/sandbox**, não corrupção; fix orienta
  garantir leitura no path e **desaconselha** `sync:universal`.
- `SQLITE_BUSY` → `warn` (lock temporário de outro processo; não trava o gate); fix é aguardar.
- Resto (`SQLITE_CORRUPT`, `SQLITE_NOTADB`, …) → `fail`, **corrupção**; fix `npm run sync:universal`.

## Alternativas consideradas

- **Testar a integridade com `PRAGMA quick_check` antes de classificar** — rejeitada: um banco que
  nem abre (CANTOPEN) não chega ao pragma; o `err.code` da abertura já carrega a distinção sem I/O extra.
- **Discriminar por mensagem de erro** — rejeitada: mensagens do SQLite variam entre versões e
  locale; `err.code` é o contrato estável, como o resto do `health.ts` já assume.

## Consequências

**Positivas**:
- Sandbox/permissão deixa de ser confundido com corrupção; o operador recebe a correção da causa real.
- `sync:universal` nunca é prescrito para um banco íntegro-mas-inacessível.
- Lock concorrente vira `warn`, não reprova o núcleo.

**Negativas / Trade-offs**:
- Mais um `err.code` (`SQLITE_BUSY`) a manter caso o driver mude a taxonomia — coberto por teste.

## Rastreamento
- Implementação: `lib/core/health.ts` (check `memory-db`)
- Testes: `test/health.test.js` (CANTOPEN, EACCES, BUSY, NOTADB)
- ADRs relacionadas: ADR-0023 (doctor como gate do núcleo), SPEC-009 (doctor-do-nucleo)
