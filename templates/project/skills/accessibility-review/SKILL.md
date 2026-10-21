---
name: accessibility-review
description: Use quando criar ou revisar telas, componentes ou fluxos de interface: verifica a conformidade com a WCAG 2.2 nível AA (teclado, foco, semântica, nomes acessíveis, contraste, formulários, movimento) com ferramentas automáticas e testes manuais, e reporta os achados por severidade.
---

# Revisão de Acessibilidade

Acessibilidade é se uma pessoa consegue concluir a tarefa: com teclado, com leitor de tela, com zoom, com pouca visão de cor. Ferramentas automáticas encontram só parte dos problemas; o resto aparece navegando de verdade.

A saída padrão é uma **tabela de achados ligados aos critérios da WCAG 2.2**. Edite código só quando o usuário pedir.

## Convenções

- Alvo: WCAG 2.2 nível AA, a menos que o projeto declare outro. No Brasil, a Lei Brasileira de Inclusão (Lei nº 13.146/2015) e o eMAG se aplicam a serviços públicos; sinalize quando for o caso.
- Escopo: as telas ou componentes que o usuário nomear, ou o diff.
- Todo achado cita o critério (por exemplo, `2.4.7 Foco Visível`), onde ocorre e como reproduzir.
- Componentes do design system: um achado no componente vale para todas as telas que o usam; corrija na origem.

## Verifique

**Automático** (encontra o óbvio, não aprova nada sozinho):
- `axe` no navegador ou nos testes (`@axe-core/playwright`, `vitest-axe`), e o Lighthouse de acessibilidade.
- Lint de JSX (`eslint-plugin-jsx-a11y` ou as regras equivalentes do oxlint/biome).

**Manual** (obrigatório):
1. **Só teclado**: percorra a tarefa inteira com Tab, Shift+Tab, Enter, Espaço, Esc e setas. Tudo alcançável, na ordem visual, sem armadilhas de foco.
2. **Foco visível** em todo elemento interativo; o foco nunca fica escondido atrás de cabeçalhos fixos (`2.4.11`).
3. **Leitor de tela** (NVDA ou VoiceOver): títulos, regiões, nomes de botões e links, mensagens de erro e de status anunciados.
4. **Zoom a 200% e largura de 320 px**: nada some, nada exige rolagem horizontal (`1.4.10`).
5. **Contraste**: texto 4,5:1 (texto grande 3:1); componentes e ícones informativos 3:1 (`1.4.3`, `1.4.11`).
6. **Movimento**: animações respeitam `prefers-reduced-motion`; nada pisca mais de 3 vezes por segundo.

## Checklist

**Semântica e estrutura**
- Um `h1` por página e títulos em ordem; regiões (`header`, `nav`, `main`, `footer`).
- Elementos nativos antes de ARIA: `button` para ações, `a` para navegação. ARIA só quando não houver elemento nativo, e completo (papel, estado, propriedades).
- `lang` da página definido.

**Nomes e textos**
- Todo controle tem um nome acessível; ícones sem texto têm `aria-label`.
- Imagens informativas com `alt` que descreve a função; decorativas com `alt=""`.
- Links com texto que faz sentido fora do contexto ("Baixar a fatura de março", não "clique aqui").

**Formulários**
- Cada campo com `label` associado; obrigatoriedade indicada além da cor.
- Erros identificados no campo, descritos em texto e anunciados (`aria-describedby`, região de status).
- Não exigir digitar de novo o que já foi informado (`3.3.7`); autenticação sem teste cognitivo (`3.3.8`).

**Interação**
- Alvos de toque com pelo menos 24×24 px (`2.5.8`).
- Ações de arrastar têm alternativa de clique (`2.5.7`).
- Diálogos prendem o foco enquanto abertos e devolvem o foco ao fechar; Esc fecha.
- Conteúdo que aparece no hover ou foco pode ser dispensado e não some sob o ponteiro (`1.4.13`).

**Conteúdo dinâmico**
- Mudanças de rota anunciadas e com o foco movido para o conteúdo novo.
- Mensagens de status (salvo, erro, carregando) em `role="status"` ou `aria-live`.
- Tempo limite avisado e extensível.

## Severidade

Bloqueador (impede concluir a tarefa: armadilha de teclado, controle sem nome, formulário sem rótulo) · Maior (dificulta muito: contraste insuficiente, foco invisível) · Menor · Detalhe.

## Formato

```
## Escopo e método
<telas, ferramentas rodadas, leitor de tela e navegador usados>

## Achados
| # | Onde | Critério WCAG | Severidade | Problema | Como reproduzir | Correção |
|---|---|---|---|---|---|---|

## O que foi verificado sem achados
```

## Próximo

- `testing`: um teste automático (axe) por tela e um caso de teclado para cada fluxo crítico.
- `frontend-architecture` quando o problema vem de um componente compartilhado.

## Evite

- Aprovar uma tela só porque o axe não acusou nada.
- ARIA em cima de `div` clicável em vez de um `button`.
- `outline: none` sem um estilo de foco no lugar.
- Indicar erro ou obrigatoriedade só pela cor.
- Corrigir tela a tela o que é defeito de um componente compartilhado.
