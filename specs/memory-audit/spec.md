# Spec: memory-audit

- **ID**: SPEC-017
- **Status**: done
- **Owner**: apk
- **ADRs relacionadas**: ADR-0009 (economia de token), ADR-0025 (coerência da doc — a mesma classe), ADR-0020 (core/registry)

## 1. Problema

A economia de token do Forja é o `context.md` como mapa do domínio (`token:economy` mede −61%). Mas
o mapa cita paths de código — "a regra mora em `domain/order.entity.ts`", "teste em
`test/orders/place-order.spec.ts`". Quando o código é renomeado ou movido e o mapa não acompanha, o
mapa passa a **mentir com confiança**: um agente lê o lugar errado, paga o custo, e chega à conclusão
errada. Um mapa desatualizado é *pior* que mapa nenhum. Nada verifica isso hoje — vive de disciplina.

## 2. Proposta de valor

O mapa deixa de poder mentir em silêncio: **todo path de código citado num `context.md` é conferido**,
e uma referência pendurada reprova. É o `adr-refs` (ADR-0025) aplicado aos mapas de memória.

## 3. User stories

- **Como** dev de um projeto gerado, **quero** um comando que reprove quando um mapa aponta para
  arquivo que não existe mais, **para que** a economia de token da memória não se volte contra mim.
- **Como** CI de um projeto, **quero** rodar isso como gate, **para que** um rename sem atualizar o
  mapa não passe batido.

## 4. Critérios de aceite (Definition of Done)

- [x] AC-1: `forja memory:audit` varre `memory/30-domains/*/context.md`, extrai os paths de código
      citados (entre crases, com `/` e terminando em `.ts`) e reprova (exit ≠ 0) se algum não existe.
- [x] AC-2: Resolve o path em múltiplas bases (relativo ao módulo, ao `backend/`, à raiz) — um mesmo
      mapa cita as duas convenções (`domain/x.ts` e `test/x.spec.ts`).
- [x] AC-3: `--project <path>` aponta para outro projeto (default: `cwd`).
- [x] AC-4: Lógica pura e testável (`lib/memory-audit.ts`); reusa `domainsOf` de `code-context`.

## 5. Escopo

**Dentro**: conferir paths de código `.ts` citados nos mapas de domínio.

**Fora** (explícito):
- Validar que o *conteúdo* do mapa (a linguagem ubíqua, as regras) ainda bate com o código — isso é
  julgamento, não path. Este gate pega o path pendurado, que é o sinal barato e objetivo.
- Rodar dentro do `project:smoke` — lá o projeto é recém-gerado, o mapa é fresco por definição. A
  divergência mapa↔código acontece com o tempo, num projeto existente; é aí que este comando roda.

## 6. NFRs / restrições

- **Compatibilidade**: comando novo; não muda nada. Sem rede, sem codegraph — leitura de disco.

## 7. Métricas de sucesso

Pelo menos um rename sem atualização de mapa pego antes do merge num projeto real — a prova de que a
fronteira estava descoberta.
