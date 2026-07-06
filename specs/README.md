# Specs — Pipeline SDD

Toda feature não-trivial passa por **spec → plan → tasks** antes de virar código.

## Fluxo

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│   spec   │ →  │   plan   │ →  │  tasks   │ →  │  código  │
│ (porquê) │    │  (como)  │    │ (passos) │    │ (impl.)  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
   Product       SDD Architect    SDD Architect    Worker
                                                   + Governance
```

## Comandos

```bash
npm run spec:new <feature>     # cria specs/<feature>/spec.md
npm run spec:plan <feature>    # cria plan.md (após spec aprovada)
npm run spec:tasks <feature>   # cria tasks.md (após plan aprovado)
npm run spec:check <feature>   # valida que as 3 fases existem e foram preenchidas
npm run spec:check             # valida todas
```

## Estrutura de uma feature

```
specs/
  <feature-slug>/
    spec.md     # problema, AC, NFRs, escopo
    plan.md     # arquitetura, contratos, decisões
    tasks.md    # decomposição executável
    notes/      # opcional: research, mockups
```

## Critérios de "spec aprovada"

- Problema descrito em 1 frase
- Pelo menos 1 user story com persona, ação, benefício
- ≥3 critérios de aceite observáveis
- Escopo fora explicitado
- NFRs com números (não "rápido", mas "p95 < 200ms")

## Quando NÃO precisa de spec

- Bugfix de 1 linha
- Renomeação/rearranjo sem mudança de contrato
- Atualização de documentação
- Bump de dependência sem breaking change

Em dúvida: escreva spec. Custa 10min, salva retrabalho.

## Relação com ADRs

- **Spec** = "vamos fazer X"
- **ADR** = "decidimos fazer X **deste jeito** por **estas razões**"

Plan da spec pode gerar 0..N ADRs novas. Toda decisão estrutural irreversível mencionada no plan vira ADR em `memory/90-decisions/`.

## Estados

| Estado | Significado |
|---|---|
| `draft` | Em escrita, não revise ainda |
| `review` | Pronto para feedback |
| `approved` | OK para próxima fase (plan ou tasks) |
| `implementing` | Código sendo escrito |
| `done` | Mergeado e validado |
| `abandoned` | Não vai acontecer (mantemos por histórico) |
