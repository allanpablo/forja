---
name: frontend-architecture
description: Use quando organizar ou revisar um front-end React ou Next.js: estrutura por funcionalidade, fronteira entre Server e Client Components, estado do servidor vs. estado do cliente, busca de dados e cache, formulários com validação, fronteiras de erro e de carregamento, e um plano de mudança incremental.
---

# Arquitetura de Front-end

Um front-end apodrece de dois jeitos: tudo vira estado global, ou cada tela reimplementa a busca de dados do seu jeito. A primeira pergunta para qualquer dado é **de quem ele é**: do servidor (vem de uma API e tem uma cópia mais nova em outro lugar) ou do cliente (existe só nesta tela, nesta sessão). Errar essa pergunta é a origem da maior parte dos bugs de sincronia.

A saída padrão é uma **avaliação e uma estrutura alvo com um plano de mudança**. Escreva componentes só quando o usuário pedir.

## Convenções

- Entradas: as histórias de `backlog-slicing`, o contrato de `api-design`, a estrutura atual e o `package.json`.
- O framework e as bibliotecas que o projeto já usa prevalecem (Next.js App Router ou Pages Router, Vite, React Query, Zustand, Redux, React Hook Form…). Proponha trocar só por um problema concreto.
- Os nomes de pastas e componentes seguem a linguagem ubíqua do domínio, não os nomes técnicos.

## Avalie primeiro

Somente leitura:

1. Rotas e páginas: quais existem, o que cada uma carrega e de onde.
2. Onde os dados são buscados: em componentes, em hooks, num cliente central. `fetch` espalhado em `useEffect` é um mau sinal.
3. Estado global: o que está nele. Dados do servidor copiados para uma store global são o problema mais comum.
4. Pastas genéricas (`components/` com tudo, `utils/`, `hooks/` sem dono).
5. Ciclos e acoplamento: `npx madge --circular --extensions ts,tsx src` (veja `ts-module-layout`).
6. No Next.js: quais componentes são `'use client'` e por quê. Um `'use client'` no topo de uma árvore grande puxa tudo para o bundle do cliente.

## Estrutura alvo

```
src/
  app/ (ou pages/)          # roteamento do framework; páginas finas que compõem funcionalidades
  features/<contexto>/      # uma por contexto ou funcionalidade do domínio
    components/             # componentes desta funcionalidade
    api.ts                  # chamadas à API e chaves de cache desta funcionalidade
    hooks.ts                # hooks de dados e de comportamento
    schema.ts               # schemas de validação (formulários, respostas)
  shared/ui/                # componentes de design system sem regra de negócio (Button, Dialog)
  shared/lib/               # infraestrutura com comportamento real: cliente HTTP, i18n, telemetria
```

Regras:

- **Organize por funcionalidade.** Uma página compõe funcionalidades; uma funcionalidade não importa os arquivos internos de outra (use o que ela exporta).
- **Estado do servidor fica num cache de servidor** (React Query/TanStack Query, SWR, ou o cache do framework), não numa store global. Cada consulta tem uma chave estável e uma política de invalidação depois das mutações.
- **Estado do cliente o mais local possível**: no componente, depois na URL (filtros, paginação, abas), depois num contexto, e só então numa store global.
- **Server Components por padrão no Next.js App Router**; `'use client'` só nas folhas que precisam de interatividade, de estado ou de APIs do navegador. Dados sensíveis e segredos nunca chegam a um Client Component.
- **Valide nas fronteiras**: respostas da API e entradas de formulário passam por um schema (`zod`, `valibot`), não por uma anotação de tipo.
- **Formulários**: uma biblioteca de formulário quando há validação ou muitos campos; mensagens de erro ligadas aos campos; o servidor revalida sempre.
- **Carregamento e erro são estados de primeira classe**: cada tela define o que mostra carregando, vazia, com erro e com sucesso. No Next.js, `loading.tsx` e `error.tsx`; no React, `Suspense` e fronteiras de erro.
- **Sem regra de negócio em componente de UI.** Cálculos e decisões vão para funções puras testáveis (`ts-testing`).

## Plano de mudança

Cada passo funciona sozinho e pode ser um commit:

1. Introduza o cache de servidor numa funcionalidade e migre a busca de dados dela.
2. Tire da store global os dados de servidor que agora estão no cache.
3. Mova os componentes da funcionalidade para `features/<contexto>/`.
4. Empurre `'use client'` para as folhas.
5. Repita por funcionalidade; apague as pastas genéricas que esvaziaram.

## Formato

```
## Estado atual
| Problema | Onde | Efeito |

## Estrutura alvo
<árvore>

## Dados
| Dado | Dono (servidor/cliente) | Onde vive | Invalidação |

## Plano de mudança
| # | Passo | Arquivos | Commit |
```

## Próximo

- `accessibility-review` para cada tela nova ou alterada.
- `web-performance` quando houver metas de Core Web Vitals.
- `ts-code-review` revisa as mudanças; `ts-testing` para hooks e funções puras.

## No Forja

No Forja, a estrutura alvo e as regras de dados ficam em `memory/20-architecture/frontend.md`; trocas de biblioteca ou de estratégia de renderização viram ADR em `memory/90-decisions/`. Rode `forja sync:universal` depois de gravar.

## Evite

- Dados do servidor duplicados numa store global.
- `fetch` em `useEffect` espalhado pelos componentes.
- `'use client'` no topo de árvores grandes.
- Uma pasta `components/` com todos os componentes do app.
- Regra de negócio dentro de componentes.
- Reescrever o front-end inteiro de uma vez.
