---
name: ts-code-review
description: Use quando revisar código TypeScript ou JavaScript, ou um diff de TS/JS: roda a checagem de tipos, o linter e os testes, depois verifica segurança de tipos, tratamento de erros, correção assíncrona e vazamentos, acoplamento entre módulos, validação de entrada nas fronteiras, uso de recursos e testes, e reporta os achados ordenados por severidade.
---

# Revisão de Código TypeScript

Procura o que torna o código TypeScript errado, frágil ou difícil de mudar, nesta ordem. O estilo que o formatador e o linter já garantem não é assunto de revisão. Tipos são evidência de forma, não de correção: um `tsc` verde com `any` e `as` por toda parte prova pouco.

A saída padrão é uma **tabela de achados**. Edite o código só quando o usuário pedir.

## Convenções

- Escopo: o diff contra o branch base (`git diff <base>...HEAD -- '*.ts' '*.tsx' '*.js' '*.mjs'`) ou os módulos que o usuário nomear. Leia o código ao redor o suficiente para julgar, mas revise só o escopo.
- Referências: `ts-module-layout` (regras de dependência), `ts-async-patterns` (checklist), `ts-testing` (idiomas de teste), `domain-modeling` (invariantes).
- As convenções do código prevalecem sobre conselhos gerais, a menos que causem um bug.
- Todo achado cita `arquivo:linha` e explica **por que** importa. Nenhum achado sem um motivo concreto.

## Rode primeiro

Quando o toolchain estiver disponível, com os próprios scripts do projeto:

1. Checagem de tipos: `tsc --noEmit` (ou `tsc -b`). Observe as flags `strict` do `tsconfig.json`; `strict: false` em código novo já é um achado.
2. Lint: o linter do projeto (`eslint` com as regras type-aware do `typescript-eslint`, `oxlint --type-aware` ou `biome check`).
3. Testes dos módulos afetados, e o build se a mudança mexer em configuração ou nos exports.
4. Quando fizer sentido: `npx madge --circular` (ciclos novos), `npx knip` (exports ou dependências novas sem uso), `npm audit`/`osv-scanner` para dependências novas.

Reporte as falhas deles como achados. Não repita com suas palavras o que eles já dizem.

## Checklist

**Segurança de tipos**
- `any` (explícito ou implícito) onde um tipo real ou `unknown` + estreitamento funcionaria.
- Casts com `as` que afirmam em vez de verificar, principalmente sobre dados externos; casts duplos (`as unknown as T`).
- Asserções de não nulo (`!`) sem um motivo para o valor não poder ser nulo.
- `@ts-ignore` em vez de `@ts-expect-error` com explicação; supressões escondendo um erro real.
- Exaustividade: `switch` sobre uma união sem a checagem `never` no `default`.
- Acesso por índice em arrays e records tratado como sempre definido (com `noUncheckedIndexedAccess` desligado).

**Fronteiras e validação**
- Entrada externa (corpos HTTP, query params, variáveis de ambiente, mensagens de fila, `JSON.parse`, respostas de terceiros) validada na fronteira com um schema (`zod`, `valibot`, class-validator no Nest), e não confiada por meio de uma anotação de tipo.
- Invariantes que podem ser contornadas: campos públicos mutáveis num agregado, construtores ou fábricas que pulam a validação, objetos devolvidos por referência e alterados por quem chama.
- Dinheiro como ponto flutuante; datas tratadas sem um fuso horário explícito; IDs comparados entre tipos diferentes.

**Erros**
- Valores lançados que não são instâncias de `Error`; erros sem `cause` ao encapsular (`new Error('carregar pedido', { cause: err })`).
- `catch (e)` que assume que `e` é um `Error` sem estreitar.
- Erros engolidos (`catch {}` sem comentário), ou registrados **e** relançados (tratados duas vezes).
- Falhas de domínio esperadas modeladas como `Error` genérico, de modo que quem chama não consegue decidir por elas.
- `return promise` dentro de `try` sem `await`, de modo que o `catch`/`finally` nunca vê a rejeição.

**Assíncrono** (veja `ts-async-patterns`)
- Promises soltas; callbacks `async` em `forEach`/`map` cujos resultados ninguém aguarda.
- `Promise.all` sem limite sobre coleções de entrada.
- `AbortSignal` ou timeout ausentes em chamadas de saída; `fetch` sem prazo.
- Ler-alterar-escrever de estado compartilhado atravessando um `await`.
- Timers, intervals e listeners nunca limpos; trabalho síncrono ou pesado de CPU no event loop.

**Design e acoplamento** (veja `ts-module-layout`)
- Código de domínio importando o ORM, o framework HTTP, SDKs ou `process.env`.
- Barrel files novos, pastas genéricas (`utils/`, `common/`) ganhando código, ciclos de import novos.
- Interfaces declaradas ao lado da sua única implementação "para mockar".
- Exports que não precisam ser exportados; default exports onde o código usa exports nomeados.
- Decorators de framework (Nest, TypeORM) vazando para os tipos de domínio.

**Idiomas**
- Uniões de tipos ou objetos `as const` vs. `enum`: siga o código; sinalize a mistura de estilos no mesmo módulo.
- `interface` vs. `type`: siga o código.
- `==` em vez de `===`; checagens de "verdadeiro" que falham com `0` ou `''`.
- Mutação de parâmetros de função; estado mutável compartilhado no nível do módulo.
- ESM e CommonJS misturados no mesmo pacote; imports ESM relativos sem `.js` com `nodenext`.

**Recursos e desempenho**
- Conexões, handles de arquivo e streams não liberados em `finally` ou com `await using`.
- Consultas N+1 em laços (veja `query-performance`), conjuntos de resultado sem limite e sem paginação.
- `JSON.parse`/`readFileSync` grandes e síncronos em caminhos de requisição; trabalho quadrático acidental (`array.includes` dentro de um laço sobre o mesmo array).
- Front-end: re-renderizações desnecessárias por props instáveis, effects sem limpeza, arrays de dependência faltando.

**Testes** (veja `ts-testing`)
- A mudança tem testes; uma correção de bug tem um teste que o reproduz.
- Nada de esperas reais, de dependência de ordem, de asserções sobre texto de erro, de `rejects` sem `await`.

## Severidade

| Nível | Significado |
|---|---|
| Bloqueador | Bug, perda de dados, entrada externa sem validação, rejeição sem tratamento, vazamento, problema de segurança. Precisa ser corrigido antes do merge. |
| Maior | Quebra uma regra de design, enfraquece a segurança de tipos numa fronteira ou torna a próxima mudança arriscada. Deve ser corrigido agora. |
| Menor | Clareza ou idioma; corrija se for barato. |
| Detalhe | Preferência. Opcional; mantenha poucos. |

## Formato

```
## Resumo
<um parágrafo: avaliação geral, quantidade de bloqueadores>

## Resultado das ferramentas
<tsc / lint / testes / ciclos: passou ou falhas>

## Achados
| # | Arquivo:linha | Severidade | Problema | Por que importa | Correção sugerida |
|---|---|---|---|---|---|

## O que está bom
<uma ou duas coisas que vale manter>
```

## No Forja

No Forja, antes de revisar, rode `forja code:check` e, para os símbolos alterados, `forja code:impact <símbolo>` (chamadores e raio de impacto); sem o codegraph, busque os chamadores com `rg`. Mudança estrutural sem ADR é um achado Maior.

## Evite

- Comentários de formatação que o formatador resolve.
- Achados sem `arquivo:linha` ou sem motivo.
- Esconder bloqueadores no meio dos detalhes.
- Pedir mais tipos onde o tipo inferido já é exato.
- Sugerir uma reescrita quando uma correção local resolve.
- Revisar código fora do escopo pedido.
- Afirmar que as ferramentas passaram sem rodá-las.
