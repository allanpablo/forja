---
name: product-evaluation
description: Use quando uma ideia de produto, startup, app, SaaS ou modelo de negócio precisa de uma avaliação crítica de viabilidade: põe à prova problema, mercado, escopo, concorrência, go-to-market e economia unitária, e devolve um veredito GO / WEAK GO / NO-GO com riscos e recomendações.
---

# Avaliação de Produto

Põe um conceito de produto à prova contra a realidade do mercado antes que alguém gaste dinheiro para construí-lo. Entrada: um conceito (app, SaaS, plataforma, ferramenta ou serviço) com o que se sabe sobre público, funcionalidades, monetização e mercado. Saída: um veredito com a evidência por trás dele. Não é para dúvidas de implementação nem para redação de negócios em geral.

A avaliação não existe para encorajar. Existe para revelar os problemas enquanto ainda são baratos.

## Convenções

- Termos em pt-BR seguidos do en-US: Proposta de Valor (Value Proposition), Adequação Produto-Mercado (Product-Market Fit), Custo de Aquisição de Cliente (Customer Acquisition Cost, CAC), Valor do Tempo de Vida do Cliente (Customer Lifetime Value, LTV), Custo de Troca (Switching Cost), Partida a Frio (Cold Start), Canal de Aquisição (Acquisition Channel).
- Toda afirmação traz sua natureza: **confirmada** (evidência fornecida ou encontrada), **suposta** (afirmada sem evidência), **desconhecida** (ninguém sabe ainda).
- Nomeie segmentos de forma concreta: não "PMEs", mas "uma agência de 3 pessoas que fatura 5+ clientes à mão, sem ninguém de operações".

## Princípio central

O ceticismo é o padrão; o otimismo se conquista com evidência. Avalie o produto como descrito, não o pitch no melhor cenário: "vai viralizar" é uma suposição não validada, não uma estratégia de crescimento. Mas a falsa negatividade é tão prejudicial quanto a falsa positividade: se o produto é sólido, diga isso com clareza.

Seja específico. "Pode ser difícil de vender" é inútil; "a aquisição depende de SEO num espaço dominado por domínios de 10 anos" é útil.

## Processo

### 1. Problema e mercado
Interrogue o problema antes da solução.
- É real e recorrente, ou episódico e de nicho?
- Quem exatamente o tem?
- Qual o contorno atual? Se é uma planilha, por que ninguém construiu isso, ou por que as ferramentas existentes falharam?
- É analgésico (precisa resolver agora) ou vitamina (bom de ter)?
- O mercado cresce, está estável ou encolhe, e por quê? Há forças regulatórias, sazonais ou estruturais?

### 2. Produto e escopo
Julgue as funcionalidades contra o problema e o usuário real, não contra o roadmap.
- A **ação de valor central**: a única coisa que o usuário precisa conseguir fazer para o produto ter entregado valor. Ela está priorizada?
- Quais funcionalidades a servem, e quais são especulativas ou exageradas antes de o núcleo ser validado?
- Que capacidade crítica um usuário sentiria falta de imediato?
- Superfície de risco técnico: APIs externas, qualidade dos dados, custo de infraestrutura em escala.
- O fluxo é realista para o usuário de verdade: atrito de onboarding, curva de aprendizado, comportamento inesperado?

### 3. Concorrência e posicionamento
- Concorrentes diretos e indiretos, incluindo processos manuais, ferramentas estabelecidas e soluções adjacentes.
- Diferenciação estrutural (abordagem, modelo, execução), não "fazemos melhor".
- É defensável por 18 meses, ou será copiado assim que um player maior vir o nicho comprovado?
- Custos de troca criados. Sem eles, a retenção é uma luta constante.
- Risco de comoditização: está construído sobre uma camada que pode se tornar irrelevante (por exemplo, um invólucro fino sobre uma API de LLM que muda rápido)?

### 4. Go-to-market e distribuição
Falha de distribuição mata mais produtos do que falha de produto.
- **Canal zero**: os 10 primeiros clientes, conquistados como, por quem?
- É executável pelos fundadores agora, ou exige recursos que eles não têm?
- Há um ciclo viral ou de indicação embutido, ou o crescimento vem só de mídia paga ou SEO?
- Ciclo de venda: autosserviço B2C vs. B2B com várias partes interessadas.
- Porteiros: lojas de apps, compras, jurídico, revisões de segurança de TI.
- A mensagem é específica o bastante para ressoar com alguém?

### 5. Monetização e economia unitária
Verifique se o modelo é internamente consistente, não só plausível.
- O modelo de preço está alinhado a como os usuários percebem o valor?
- Há evidência de disposição a pagar (benchmarks, produtos análogos, pesquisa), ou é suposição?
- CAC:LTV com conversão e churn realistas, não otimistas.
- Vetores de custo em escala: computação, suporte, licenciamento de dados, compliance.
- Caminho até a economia unitária positiva, e em que escala?
- E se o principal canal de aquisição ficar 2× mais caro?

### 6. Testes transversais
Aplique a todas as áreas acima:
- **Partida a frio**: o valor exige massa crítica? Como ela é formada?
- **Cadeias de dependência**: quais sistemas, APIs, plataformas ou regulações precisam se manter? O que quebra se mudarem?
- **Execução**: o time descrito consegue construir? O que está subestimado?
- **Momento**: cedo demais, agora, ou já passou do pico?
- **Uso real**: o que acontece quando os usuários fazem o inesperado?
- **Efeitos de segunda ordem**: o sucesso cria problemas novos (carga de suporte, custo de infraestrutura, atenção regulatória)?

### 7. Veredito
- **GO**: o problema é real, existe um canal até os primeiros clientes, a conta fecha; os riscos restantes são conhecidos.
- **WEAK GO**: viável só se incógnitas específicas forem resolvidas antes; nomeie-as.
- **NO-GO**: uma falha estrutural que nenhum esforço razoável corrige.

Nomeie o único fator mais decisivo.

### 8. Encaminhamento
Incógnitas a investigar → `requirements-elicitation`; escopo de um GO → `requirements-gathering`; riscos técnicos → `technical-spike`; dados pessoais → `lgpd-compliance`; veredito para as partes interessadas → `executive-writing`.

## Formato de saída

```
# Avaliação de produto: <produto>

## Veredito
<GO | WEAK GO | NO-GO> — <um parágrafo nomeando o fator mais decisivo>

## Pontos fortes
- <ponto forte específico> (ou: nenhum ponto forte claro)

## Pontos fracos
1. <problema estrutural ou de execução, do mais grave ao menos grave>

## Riscos e incógnitas
- Conhecidos: <visíveis, gerenciáveis com esforço>
- Desconhecidos: <pontos cegos que exigem descoberta antes de seguir>
- Dependências externas: <fora do controle do time>

## Recomendações
1. <ação específica> — impacto: <...> — dificuldade/custo: <...>

## Uso realista vs. idealizado
| Projetado para | Provavelmente usado para | Diferença |

## Dependências e restrições
- Técnicas: ...
- Regulatórias: ...
- Momento de mercado: ...
- Time: ...
- Capital: ...

## Encaminhamento
- <skill>: <o que vai para lá>
```

## Evite

- Consolo, rodeios ou enchimento.
- Feedback genérico que serviria para qualquer produto.
- Tratar as projeções do fundador ("viral", "todo mundo precisa disso") como evidência.
- Apresentar suposições como confirmadas.
- Negatividade sem razão estrutural; um produto sólido recebe um GO claro.
- Recomendações sem ordem, custo ou dificuldade.
- Desenhar a solução: telas, stack, arquitetura.
