---
name: web-performance
description: Use quando uma aplicação web está lenta ou precisa cumprir metas de Core Web Vitals: separa dados de campo e de laboratório, diagnostica LCP, INP e CLS, revisa bundle, imagens, fontes e cache, e propõe correções ordenadas pelo efeito esperado, com verificação antes e depois.
---

# Desempenho Web

O que importa é o que os usuários reais experimentam, no aparelho e na rede deles. Uma nota 100 no Lighthouse da sua máquina não diz nada sobre um celular intermediário em 4G. Meça no campo, diagnostique no laboratório, corrija o que a medição apontar.

A saída padrão é um **diagnóstico e correções ordenadas**. Altere código só quando o usuário pedir.

## Convenções

- Metas: os limites "bons" das Core Web Vitals no percentil 75 dos usuários: **LCP ≤ 2,5 s**, **INP ≤ 200 ms**, **CLS ≤ 0,1**. Metas do projeto vêm de `requirements-gathering` (`RNF-NN`).
- Entradas: dados de campo (CrUX, o RUM do projeto, a biblioteca `web-vitals`), dados de laboratório (Lighthouse, DevTools Performance, WebPageTest), o build e o framework.
- Não otimize sem medição. Cada correção nomeia a métrica que melhora.

## Meça

1. **Campo primeiro**: o percentil 75 por página e por tipo de aparelho. Sem dados de campo, instrumente com `web-vitals` e mande para o backend de métricas (`observability`).
2. **Laboratório** para encontrar a causa: Lighthouse e o painel Performance do DevTools com limitação de CPU (4×) e rede (4G lento), num build de produção.
3. **Bundle**: o analisador do bundler (`next build` mostra o tamanho por rota; `vite-bundle-visualizer`, `source-map-explorer`).

## Diagnostique

| Métrica | Causas comuns | Correções típicas |
|---|---|---|
| **LCP** (maior conteúdo visível) | Servidor lento (TTFB), imagem principal grande ou carregada tarde, CSS/JS bloqueando a renderização, conteúdo renderizado só no cliente | Cache/CDN e renderização no servidor, `fetchpriority="high"` e dimensões certas na imagem LCP, formatos modernos (AVIF/WebP), CSS crítico, remover JS que bloqueia |
| **INP** (resposta à interação) | Tarefas longas no thread principal, hidratação pesada, handlers que fazem trabalho demais, re-renderizações em cascata | Dividir tarefas longas, adiar o que não é urgente, mover trabalho para Web Workers, reduzir JS do cliente (Server Components), memoização onde a medição mostra re-renderização cara |
| **CLS** (estabilidade visual) | Imagens e iframes sem dimensões, anúncios/embeds injetados, fontes que trocam e mudam o tamanho, conteúdo inserido acima do existente | `width`/`height` ou `aspect-ratio`, espaço reservado, `font-display` com fallback de métricas ajustadas, inserir conteúdo abaixo da dobra ou em resposta a uma interação |

**Também verifique**
- **JavaScript**: o tamanho por rota, divisão de código por rota e por interação (`import()` dinâmico), dependências grandes trocáveis, polyfills desnecessários.
- **Imagens**: tamanhos responsivos (`srcset`/`sizes` ou o componente de imagem do framework), lazy loading abaixo da dobra e nunca na imagem LCP.
- **Fontes**: poucas famílias e pesos, `woff2`, pré-carregamento só da fonte usada acima da dobra.
- **Cache**: arquivos com hash e `Cache-Control: immutable`; HTML com revalidação; compressão Brotli.
- **Terceiros**: cada script de terceiro (analytics, chat, anúncios) tem um custo medido e é carregado depois do conteúdo.
- **Dados**: cascatas de requisições (uma depende da outra), respostas grandes demais, ausência de paginação (`api-design`).

## Verifique

Repita a mesma medição de laboratório depois da mudança, no mesmo perfil, e compare. Confirme no campo depois do deploy (a janela do CrUX é de 28 dias; o RUM próprio mostra antes). Defina um orçamento de desempenho no CI (tamanho de bundle por rota, Lighthouse CI) para não regredir.

## Formato

```
## Medição
| Página | Aparelho | LCP p75 | INP p75 | CLS p75 | Fonte (campo/lab) |

## Diagnóstico
| Métrica | Causa | Evidência (trace, waterfall, bundle) |

## Correções (ordenadas por efeito esperado / custo)
| # | Correção | Métrica | Efeito esperado | Custo |

## Verificação e orçamento
<antes → depois; orçamento proposto para o CI>
```

## Próximo

- `frontend-architecture` quando a causa é estrutural (estado global, `'use client'` demais).
- `observability`: Core Web Vitals de campo como SLIs.
- `ci-pipeline-review` para o orçamento de desempenho no CI.

## Evite

- Otimizar pela nota do Lighthouse em vez das métricas de campo.
- Medir em modo de desenvolvimento ou numa máquina potente sem limitação.
- Lazy loading na imagem do LCP.
- Memoizar tudo "por precaução".
- Afirmar uma melhora sem números de antes e depois.
