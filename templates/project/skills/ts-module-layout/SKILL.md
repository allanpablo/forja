---
name: ts-module-layout
description: Use quando organizar ou reorganizar uma base de código TypeScript ou JavaScript (serviços Node, NestJS, bibliotecas, front-ends): avalia a árvore de pastas e o grafo de imports atuais e propõe uma estrutura alinhada aos contextos delimitados, sem ciclos de import, barrel files ou pastas genéricas, com regras de dependência verificáveis e um plano de movimentação incremental.
---

# Estrutura de Módulos em TypeScript

Em TypeScript o arquivo é o módulo, e a pasta é só uma convenção. Nada impede um arquivo de domínio de importar o cliente do banco, a não ser regras que você escreve e verifica. Uma estrutura organizada por contexto de negócio mantém uma mudança num lugar só. Uma estrutura organizada por camada técnica (`models/`, `services/`, `controllers/`) espalha cada funcionalidade pela árvore inteira, e os barrel files (`index.ts` que reexportam tudo) a transformam numa teia de ciclos.

A saída padrão é uma **avaliação e uma estrutura alvo com um plano de movimentação**. Mova arquivos só quando o usuário pedir.

## Convenções

- Entradas: contextos de `bounded-context-mapping` ou `domain-modeling`; a árvore atual; `package.json`, `tsconfig.json` e o framework em uso.
- As convenções existentes prevalecem quando funcionam. Proponha uma mudança só para um problema concreto (ciclos, acoplamento, propriedade confusa, builds lentos).
- A estrutura do framework é respeitada onde ela sustenta algo (módulos NestJS, roteamento `app/` do Next.js), e os contextos são organizados dentro dela.
- Programas pequenos ficam planos: alguns arquivos em `src/` estão bem até começar a doer.
- Projetos JavaScript seguem as mesmas regras; os tipos vêm de JSDoc com `checkJs` quando o projeto o usa.

## Avalie primeiro

Somente leitura:

1. `tsc --noEmit` (ou `tsc -b` com project references): o build é a linha de base.
2. Ciclos: `npx madge --circular --extensions ts,tsx src` (ou `npx dpdm`). Em TS, ciclos compilam e falham em tempo de execução como imports `undefined` ou erros de zona morta temporal.
3. Quem importa quem: `npx depcruise src --output-type text` ou `madge --image`. Procure arquivos de domínio importando infraestrutura (ORM, clientes HTTP, SDKs, `process.env`).
4. Barrel files: arquivos `index.ts` que só reexportam. Eles escondem o grafo real de dependências e criam ciclos.
5. Nomes de pastas: os genéricos (`utils`, `common`, `helpers`, `shared`, `lib`, `types`, `models`, `services`) são um mau sinal.
6. Código morto e dependências sem uso: `npx knip`.
7. Formato de módulo: `"type"` no `package.json`, `module`/`moduleResolution` no `tsconfig.json`. ESM e CommonJS misturados são um achado por si só.

## Estrutura alvo

```
src/
  main.ts                     # raiz de composição: config, montagem, start. Sem lógica de negócio.
  <contexto>/                 # um por contexto delimitado, ex.: booking/, billing/
    domain/                   # entidades, objetos de valor, políticas, interfaces de repositório. TS puro.
    application/              # casos de uso; depende só do domínio
    adapters/
      http/                   # controllers/rotas deste contexto
      persistence/            # implementa as interfaces de repositório do domínio
  platform/                   # infraestrutura transversal com comportamento real: db, logging, config
test/                         # testes de integração e e2e (os unitários ficam junto do código)
```

Com NestJS, cada contexto é um módulo Nest (`booking.module.ts`) que monta os próprios providers; `domain/` fica livre de decorators do Nest. Num front-end, a mesma ideia vale como pastas por funcionalidade (`features/<contexto>/`), com os componentes básicos de UI num pacote de design system, e não num `components/` guardando tudo.

Regras:

- **Organize por contexto, não por camada.** Divida um contexto em `domain/application/adapters` só quando ele crescer; um contexto pequeno pode ter três arquivos.
- **As dependências apontam para dentro.** `domain/` importa só a biblioteca padrão e o próprio contexto. `adapters/` importam o domínio, nunca o contrário. `process.env` é lido em `platform/config` e passado adiante.
- **As interfaces pertencem a quem as consome.** O domínio declara `interface BookingRepository`; o adaptador de persistência a implementa. A tipagem estrutural torna isso gratuito; não crie uma interface ao lado da sua única implementação "para testar".
- **Os contextos conversam por costuras explícitas:** o serviço de aplicação do outro contexto ou eventos publicados, nunca seus arquivos internos. Respeite as relações do mapa de contextos (uma Camada Anticorrupção é um módulo que traduz).
- **Sem barrel files** dentro da aplicação. Importe o arquivo que define a coisa. A API pública de um pacote é o campo `exports` do `package.json`, não um `index.ts` que reexporta o mundo.
- **Sem pastas genéricas.** Um utilitário vai para o módulo que o usa, ou para um módulo com o nome do que ele faz (`money.ts`, `clock.ts`).
- **Aliases de caminho são ergonomia, não fronteira.** `@booking/*` em `paths` do `tsconfig` não impede um import proibido; uma regra de dependência impede.
- **Verifique as regras no CI:** regras do `dependency-cruiser`, `eslint-plugin-boundaries` ou `no-restricted-imports` por pasta. Uma regra que não é verificada é uma sugestão.
- **Um pacote só**, a menos que partes sejam versionadas ou publicadas separadamente. Aí use workspaces (npm/pnpm) e project references do TypeScript, com cada pacote expondo sua API pelo `exports`.
- **Um formato de módulo só.** Código novo é ESM (`"type": "module"`, `module: "nodenext"`, imports relativos com extensão `.js`), a menos que o projeto seja CommonJS de propósito.

## Plano de movimentação

Cada passo compila e passa nos testes sozinho, para poder ser um commit próprio:

1. Quebre os ciclos primeiro (mova o tipo compartilhado para o módulo dono do conceito, ou inverta com uma interface do lado de quem consome).
2. Remova os barrel files nos caminhos que você vai mover, apontando os imports para o arquivo que define.
3. Crie a pasta do contexto e mova os arquivos de domínio.
4. Mova os adaptadores para trás das interfaces do domínio.
5. Atualize a raiz de composição (`main.ts` ou o módulo raiz do Nest).
6. Adicione as regras de dependência ao CI para a estrutura não regredir.
7. Apague as pastas genéricas que ficaram vazias.

Use a refatoração "mover arquivo" do editor (ela reescreve os imports), ou `ts-morph` para movimentações grandes. Rode `tsc --noEmit` e os testes depois de cada passo. Evite localizar-e-substituir manual nos caminhos de import.

## Formato

```
## Estado atual
| Problema | Onde | Efeito |

## Árvore alvo
<árvore>

## Regras de dependência
<imports permitidos entre pastas, e a ferramenta/config que os verifica>

## Plano de movimentação
| # | Passo | Arquivos afetados | Commit |
```

## Próximo

- `ts-code-review` verifica se o código novo respeita as regras de dependência.
- `commit-message`: um commit `refactor` por passo.

## Evite

- `models/`, `services/`, `controllers/`, `utils/` no primeiro nível.
- Barrel files `index.ts` reexportando uma pasta inteira.
- Aliases de caminho do `tsconfig` usados como se fossem fronteiras.
- Arquivos de domínio importando o ORM, o framework HTTP ou `process.env`.
- Dividir em muitos pacotes de workspace antes de qualquer coisa ser publicada separadamente.
- Reorganizações de uma vez num commit só.
