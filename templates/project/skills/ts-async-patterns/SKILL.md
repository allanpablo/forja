---
name: ts-async-patterns
description: Use quando código TypeScript ou JavaScript precisa de concorrência ou tem bugs assíncronos (serviços Node, workers, scripts): decide se a concorrência é necessária e então orienta a posse das promises, cancelamento e timeouts com AbortSignal, concorrência limitada, backpressure de streams, worker threads para trabalho de CPU e desligamento limpo, com um checklist de vazamentos.
---

# Padrões Assíncronos em TypeScript

O Node roda seu código numa thread só e faz I/O de forma concorrente. Isso torna a concorrência fácil de começar e fácil de errar: um `Promise.all` sobre dez mil itens abre dez mil conexões, uma promise esquecida rejeita sem ninguém ouvindo, e um `setInterval` mantém o processo vivo depois do desligamento. Toda operação assíncrona precisa de um dono que a aguarde e de uma forma de pará-la.

A saída padrão é uma **escolha de padrão com a justificativa e um checklist**. Escreva código só quando o usuário pedir.

## Convenções

- Entradas: metas de vazão e latência de `requirements-gathering` / `observability`, limites de taxa dos serviços a jusante, o código existente.
- Os padrões já existentes no código prevalecem. APIs da plataforma primeiro (`AbortController`, `node:stream/promises`, `node:timers/promises`, `node:worker_threads`), depois bibliotecas pequenas e focadas (`p-limit`, `p-map`, `piscina`) quando o projeto permite dependências.
- Promises soltas são pegas pelo linter (`@typescript-eslint/no-floating-promises` ou o `typescript/no-floating-promises` do oxlint); veja `ts-code-review`.

## Decida primeiro

A concorrência se justifica quando o trabalho é **independente** e limitado por I/O (chamadas, consultas, arquivos). Trabalho limitado por CPU não fica mais rápido com mais promises: ele bloqueia o event loop e precisa de worker threads ou de outro processo. "Deixar mais rápido" sem uma medição não é motivo. `for … of` sequencial com `await` é o padrão.

## Regras

- **Posse**: a função que inicia o trabalho assíncrono o aguarda ou o entrega a alguém que aguarda. Nada de "dispara e esquece" em caminhos de requisição. Uma tarefa de fundo deliberada passa por uma fila ou por um supervisor que registra e tenta de novo.
- **Cancelamento**: toda operação longa ou de saída aceita um `AbortSignal` e o repassa (`fetch(url, { signal })`, drivers de banco, `setTimeout` de `node:timers/promises`). Combine sinais com `AbortSignal.any([pai, AbortSignal.timeout(ms)])`.
- **Prazos**: toda chamada de saída tem um timeout derivado do orçamento de quem chama. `fetch` não tem timeout padrão.
- **Concorrência limitada**: nunca `Promise.all(items.map(fn))` sobre uma entrada sem limite. Use um limite (`p-limit`, `p-map` com `concurrency`, ou um pequeno pool de workers).
- **Erros**: toda promise tem um tratamento. Escolha de propósito entre `Promise.all` (falha rápido; as outras continuam rodando, a menos que você as aborte) e `Promise.allSettled` (coleta todos os resultados). Uma rejeição sem tratamento derruba o processo Node por padrão; isso está certo, então não a silencie globalmente.
- **Estado compartilhado**: o event loop torna atômicas as instruções isoladas, não as sequências que atravessam um `await`. Um ler-alterar-escrever que atravessa um `await` precisa de um lock, uma fila ou uma transação.
- **Recursos**: libere em `finally` ou com `await using` (gerenciamento explícito de recursos) para conexões, handles de arquivo e locks. Remova os listeners e limpe os timers que você criou.
- **Nunca bloqueie o loop**: nada de criptografia ou compressão síncrona, `JSON.parse` grande ou APIs de arquivo `*Sync` em caminhos de requisição.

## Padrões

| Necessidade | Padrão |
|---|---|
| Rodar N tarefas independentes, falhar rápido no primeiro erro | `Promise.all` com limite, mais um `AbortController` abortado na primeira falha |
| Rodar N tarefas e reportar todos os resultados | `Promise.allSettled` com limite; mapeie os resultados por índice |
| Processar um fluxo de jobs com paralelismo fixo | Pool de workers limitado (`p-limit` / `p-map`) ou uma fila com N consumidores |
| Transformar dados em etapas | `node:stream` + `pipeline()` de `node:stream/promises`, ou geradores assíncronos consumidos com `for await` |
| Chamar vários backends e juntar os resultados | Fan-out com limite e `AbortSignal.timeout` por chamada; colete num array indexado pela posição |
| Trabalho limitado por CPU | `worker_threads` (um pool como `piscina`), nunca na thread principal |
| Limitar a taxa de chamadas a uma dependência | Token bucket ou o limitador do provedor; respeite `Retry-After` |
| Evitar trabalho concorrente duplicado | Memorize a promise em andamento por chave (single-flight) e limpe-a ao concluir |
| Tentar de novo uma falha transitória | Backoff exponencial com jitter e um número máximo de tentativas, só para operações idempotentes |

## Backpressure

Quando os produtores são mais rápidos que os consumidores, escolha de propósito:

- **Bloquear**: respeite o `write()` devolvendo `false` e espere o `'drain'`, ou use `pipeline()`, que faz isso por você. Padrão para pipelines internos.
- **Rejeitar**: devolva `429`/`503` quando a fila estiver cheia. Para serviços guiados por requisições.
- **Descartar ou amostrar**: para dados do tipo telemetria, em que a perda é aceitável. Conte os descartes como métrica.

Nunca use um array sem limite como fila: ele transforma sobrecarga em estouro de heap.

## Desligamento limpo

Em `SIGTERM`/`SIGINT`: pare de aceitar trabalho (`server.close()`, depois `server.closeIdleConnections()`), aborte o `AbortController` raiz, espere o trabalho em andamento com um prazo, descarregue e feche os recursos (pool do banco, consumidores de fila, telemetria) e então saia. Registre os handlers uma vez, na raiz de composição. Os frameworks oferecem ganchos para isso (`app.enableShutdownHooks()` no NestJS, `onClose` no Fastify).

## Checklist

- [ ] Toda promise é aguardada, devolvida ou explicitamente possuída por um supervisor.
- [ ] Toda operação longa ou de saída recebe um `AbortSignal` e tem timeout.
- [ ] A concorrência sobre coleções é limitada.
- [ ] Grupos que falham rápido abortam o trabalho restante no primeiro erro.
- [ ] Nenhum ler-alterar-escrever de estado compartilhado atravessa um `await` sem lock ou transação.
- [ ] Nenhum trabalho pesado de CPU ou `*Sync` no event loop em caminhos de requisição.
- [ ] Listeners, intervals e timers criados são removidos no desligamento.
- [ ] O desligamento escoa o trabalho em andamento dentro de um prazo.
- [ ] Os testes usam timers falsos (`vi.useFakeTimers()`, `mock.timers` no `node:test`) ou relógios injetados em vez de esperas reais.

## Formato

```
## Problema
<carga, tamanho da entrada, metas, limitado por I/O ou por CPU>

## Decisão
<sequencial | padrão>, porque <motivo>. Limite: <n>, a partir de <medição ou limite a jusante>.
Cancelamento/timeouts: <sinais e orçamentos>. Backpressure: <bloquear | rejeitar | descartar>. Desligamento: <sequência>.

## Checklist
<itens com ✅/❌ para o código existente>
```

## Próximo

- `ts-testing` para testes com timers falsos e de caminhos de aborto.
- `ts-code-review` verifica o checklist na implementação.
- `observability`: atraso do event loop, profundidade da fila, quantidade em andamento e descartes como métricas.

## Evite

- `Promise.all` sobre entrada sem limite.
- Callbacks `async` passados ao `forEach` (ninguém os aguarda).
- Promises iniciadas e nunca aguardadas em caminhos de requisição.
- Esperas baseadas em `setTimeout` para sincronização.
- Engolir erros com `.catch(() => {})`, ou um handler global de `unhandledRejection` que só registra.
- Trabalho limitado por CPU na thread principal.
- Adicionar concorrência sem uma medição mostrando que ajuda.
