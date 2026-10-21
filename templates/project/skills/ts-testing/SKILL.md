---
name: ts-testing
description: Use quando escrever ou revisar código de teste em TypeScript ou JavaScript: casos parametrizados, o executor do projeto (Vitest, node:test, Jest), fakes escritos à mão, timers falsos e relógios injetados, asserções de erro, isolamento de HTTP e rede, testes baseados em propriedades, testes de tipos e isolamento dos testes de integração. Funciona em par com a skill `testing`, que decide o que testar.
---

# Testes em TypeScript

Idiomas de TypeScript para código de teste. A skill `testing` decide **o que** testar e em qual camada; esta decide **como** isso é escrito em TypeScript ou JavaScript. Use as duas juntas: planeje com `testing`, escreva com `ts-testing`.

As convenções existentes no código prevalecem sobre esta skill.

## Convenções

- Use o executor que o projeto já tem. Quando não houver nenhum: Vitest para projetos TypeScript, `node:test` para pacotes Node pequenos que querem zero dependências. Não adicione Jest a um projeto que tem Vitest, nem o contrário.
- Nenhuma biblioteca de asserção, mock ou matcher além do que o executor oferece, a menos que o projeto já a use.
- Testes unitários junto do código (`order.test.ts`); testes de integração e e2e em `test/`, com config ou padrão de nome próprios.
- Os testes passam pela checagem de tipos como o resto do código (`tsc --noEmit` os cobre). Um teste que só passa porque o executor remove os tipos não está passando.

## Comandos

- Gate do CI: a suíte inteira mais a checagem de tipos, por exemplo `tsc --noEmit && vitest run` ou `node --test`.
- Localmente, rode só o que você está mexendo: `vitest run src/booking`, `vitest -t "<nome do caso>"`, `node --test --test-name-pattern "<nome>"`.
- A suíte rápida e a suíte de integração são comandos separados (`test` e `test:e2e`/`test:integration`).

## Estrutura

- **Casos parametrizados**: `it.each` / `test.each` com um array de objetos nomeados, ou um `for … of` sobre os casos chamando `test(nome, …)`. Uma tabela por comportamento, não por função. Nomes dos casos na linguagem ubíqua.
- `describe` agrupa um comportamento; nada de aninhamento profundo.
- Caixa-preta por padrão: importe a API pública do módulo. Não exporte internos só para os testes alcançarem.
- Cada teste monta os próprios dados; `beforeEach` só para preparação que todos os casos de fato compartilham. Nenhum estado vazando entre testes.

```ts
describe('Period.contains', () => {
  const period = mustPeriod(start, end); // helper de teste: cria um Period válido ou falha o teste

  it.each([
    { name: 'no início', at: start, want: true },
    { name: 'no fim', at: end, want: true },
    { name: 'um milissegundo depois do fim', at: new Date(end.getTime() + 1), want: false },
  ])('$name', ({ at, want }) => {
    expect(period.contains(at)).toBe(want);
  });
});
```

## Dependências

- **Fakes**: classes em memória escritas à mão implementando a interface do repositório (`class InMemoryBookingRepository implements BookingRepository`). Com tipagem estrutural, um objeto simples também serve; mantenha-o tipado.
- **Mocks**: `vi.fn()` / `mock.fn()` só para observar uma chamada que é o próprio comportamento (um evento publicado, um e-mail enviado). Não para substituir por padrão os colaboradores do sistema sob teste.
- **Mock de módulo** (`vi.mock`, `jest.mock`) é último recurso: acopla o teste a caminhos de arquivo e esconde costuras que faltam. Prefira passar a dependência.
- **Tempo**: o código de domínio recebe o tempo como parâmetro ou um relógio injetado (`() => Date`); nunca `new Date()` ou `Date.now()` dentro do domínio. Para código com timers, use timers falsos (`vi.useFakeTimers()`, `mock.timers.enable()` no `node:test`) e avance-os explicitamente. O mesmo vale para IDs e aleatoriedade.
- **Handlers HTTP**: a injeção em processo do framework (`app.inject()` no Fastify, `supertest` contra o app Nest/Express), não uma porta real.
- **HTTP de saída**: intercepte na camada de rede (`msw`, ou o `MockAgent` do `undici` para o `fetch` embutido). Falhe o teste em qualquer requisição não prevista.
- **Ambiente**: a configuração é passada; os testes nunca dependem do `.env` do desenvolvedor.

## Erros e comparação

- Verifique o tipo ou o código do erro: `await expect(promise).rejects.toBeInstanceOf(InvalidPeriodError)`, ou um campo `code`. Nunca o texto da mensagem.
- Quando o código devolve resultados em vez de lançar (`Result`/`Either`), verifique a variante de erro, não uma exceção lançada.
- `toEqual` para comparar valores, `toStrictEqual` quando propriedades `undefined` e a identidade da classe importam. Use `expect.objectContaining` com parcimônia; asserções parciais escondem regressões.
- Sempre faça `await` ou `return` das asserções sobre promises. Um `await` faltando num `rejects` faz o teste passar sem verificar nada.

## Dados

- Fixtures em `test/fixtures/`; builders (`aBooking({ … })`) para objetos de domínio com padrões razoáveis.
- Snapshots só para saídas grandes, estáveis e revisadas (documentos gerados, contratos serializados). Nunca para objetos que você poderia verificar campo a campo.
- **Testes baseados em propriedades** (`fast-check`) para parsers e construtores de objetos de valor que aceitam entrada externa (CPF/CNPJ, e-mails, documentos). Use os casos da tabela como semente.
- **Testes de tipos** para tipos públicos de bibliotecas: `expectTypeOf` (Vitest) ou `tsd`, rodando no CI.

## Testes de integração

- Comando e config separados, para a suíte rápida continuar rápida.
- Dependências reais (PostgreSQL num container via Testcontainers ou um serviço do compose). Cada teste é dono dos seus dados: uma transação revertida no fim, ou um schema/banco dedicado.
- Nenhum teste depende da ordem de execução de outro.

## Benchmarks

`vitest bench` (ou `node:test` com `performance.now()` num script dedicado) só quando desempenho é um requisito declarado. Benchmarks não rodam na suíte rápida.

## Evite

- Um segundo framework de teste ou biblioteca de asserção.
- `new Date()`, `Math.random()`, `crypto.randomUUID()` ou estado global dentro do código sob teste.
- Verificar o texto das mensagens de erro.
- Esperas reais com `setTimeout` ou polling sem prazo.
- `vi.mock` dos seus próprios módulos como forma padrão de isolar.
- `expect(...).rejects` / `resolves` sem `await`.
- `any` nos testes para calar a checagem de tipos.
- Exportar identificadores só para os testes alcançarem.
