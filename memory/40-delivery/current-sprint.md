# Sprint Atual

## Projeto
framework-root (o repo do Forja — produtos vivem no workspace, ADR-0019)

## Objetivos
- Fechar a classe de falha "erra sem avisar" (ADR-0021) com gates executáveis, não correções pontuais.

## Itens da Sprint
- [x] SPEC-009 — Doctor do núcleo (`specs/doctor-do-nucleo/`, ADR-0023)
      `tools:doctor` deixa de auditar só ferramentas opcionais e passa a ser gate do núcleo:
      ABI nativa, memória, workspace, deps de runtime, `.mcp.json`. Exit 1 no que trava o fluxo.
- [x] `spec:new` mantém a allow-list do `.gitignore` — spec nova do framework nascia invisível ao git.

## Próximos candidatos (sem spec ainda)
- `release-auditor` consumindo `lib/core/health.mjs` em vez de heurística própria — é a terceira
  superfície prevista no ADR-0023 e a única que ainda não migrou.
- Checks de núcleo no CI (`tools:doctor` como step), fechando o ciclo: hoje o CI roda os testes,
  mas não o gate.

## Ritual CLI
- Planejar: npm run gsd:plan -- <slug> "<objetivo>"
- Handoff spec: npm run gsd:handoff -- spec <slug>
- Handoff plan: npm run gsd:handoff -- plan <slug>
- Handoff implement: npm run gsd:handoff -- implement <slug>
- Validar: npm run gsd:check -- <slug>
- Governança: npm run project:check && npm run tools:doctor
