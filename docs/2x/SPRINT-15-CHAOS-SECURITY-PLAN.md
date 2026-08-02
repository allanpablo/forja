# Sprint 15 — Caos determinístico e hardening de segurança

## Objetivo

Transformar falhas previsíveis em estados auditáveis, sem perder evidência nem
permitir que entradas externas escapem do escopo da execução.

## Entregas

- approval expirada e reutilização recusadas;
- corrupção de payload SQLite falha explicitamente;
- policy continua deny-by-default;
- caminhos Graph/Git fora da raiz são ignorados;
- sandbox não herda secrets arbitrários do ambiente;
- testes MCP stdio cobrem payload/protocolo em processo real.

## Fora do escopo desta fatia

Docker escape review, plugins maliciosos, lock SQLite sob concorrência,
checkpoint rollback automático, fuzzing de payload e benchmark de tokens. Esses
casos continuam como bloqueios de release 10/10, embora os gates básicos já
estejam cobertos.
