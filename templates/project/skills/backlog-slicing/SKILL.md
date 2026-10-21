---
name: backlog-slicing
description: Use quando transformar uma especificação de requisitos em trabalho entregável: divide os requisitos em histórias de usuário pequenas e verticais, com critérios de aceite, tamanhos e dependências, e sinaliza o que precisa de um spike antes.
---

# Fatiamento do Backlog

Transforma uma especificação de requisitos em histórias que entregam, cada uma, algo que o usuário consegue ver, atravessando todas as camadas, em poucos dias. Fatias verticais pequenas dão feedback cedo, mantêm os pull requests revisáveis e tornam o progresso real em vez de percentual.

A saída padrão é uma **lista ordenada de histórias**. Crie issues num gerenciador só quando o usuário pedir.

## Convenções

- Entrada: a especificação de `requirements-gathering` (`RF-NN`, `RN-NN`, `RNF-NN`, prioridades, critérios de aceite).
- As histórias mantêm os IDs dos requisitos que cobrem. Todo `RF-NN` termina em pelo menos uma história; uma história sem requisito está fora do escopo ou é um requisito faltando.
- IDs de história: `ST-NN`. Nunca reutilizados.
- Histórias na linguagem ubíqua do usuário. Nada de tarefas técnicas disfarçadas de história.
- Incógnitas vão para **Perguntas em aberto**. Não invente requisitos para preencher uma fatia.

## Vertical, não horizontal

Uma fatia vertical atravessa UI/API, aplicação, domínio e armazenamento para um pedaço estreito de comportamento. "Criar as tabelas do banco" ou "construir a camada de API" são horizontais e não entregam nada sozinhas.

Formas de dividir, em ordem de preferência:

1. **Passos do fluxo**: uma história por passo da jornada do usuário (fazer pedido → pagar → acompanhar).
2. **Caminho feliz primeiro**: o caminho de sucesso mais simples, e depois cada caminho alternativo e de erro como história própria.
3. **Regras de negócio**: o fluxo central com uma regra, e depois uma história por `RN-NN` acrescentada.
4. **Variações de dados**: um meio de pagamento primeiro, os outros depois; um país, depois mais.
5. **Operações (CRUD)**: criar e visualizar primeiro; editar e excluir quando necessário.
6. **Interface**: uma versão simples primeiro, a interface rica depois.
7. **Adiar desempenho**: faça funcionar, e depois uma história para a meta do `RNF-NN`, quando o requisito permitir.

## Verificações

- **INVEST**: Independente, Negociável, Valiosa, Estimável, Pequena (Small), Testável. Uma história que falha em "Estimável" precisa de um spike (`technical-spike`) antes. Uma história que falha em "Pequena" é dividida de novo.
- **Tamanho**: P (≤ 1 dia), M (2–3 dias), G (uma semana). G é um alerta; qualquer coisa maior precisa ser dividida.
- **Critérios de aceite**: Dado/Quando/Então, tirados dos requisitos, estreitados ao que esta fatia faz. Eles alimentam `testing` diretamente.
- **Requisitos não funcionais** são anexados às histórias que restringem, como critérios de aceite. Uma história separada só quando o trabalho é real e separável (por exemplo, um teste de carga).
- **Habilitadores** (CI, infraestrutura, uma migração) só são permitidos quando uma história precisa deles, e ficam ligados a essa história.

## Ordenação

1. Esqueleto andante (walking skeleton): o caminho ponta a ponta mais fino, implantável.
2. Depois por prioridade (`Must` antes de `Should`) e por risco: a suposição mais arriscada é testada mais cedo.
3. Respeite as dependências e evite cadeias: se B não pode começar até A ser entregue, verifique se a divisão está certa.

## Formato

```
## ST-01 — <título na linguagem ubíqua> [<tamanho>] [<Must/Should/Could>]
Como <ator>, quero <capacidade>, para <benefício>.
Cobre: RF-NN, RN-NN, RNF-NN
Critérios de aceite:
- Dado <estado>, quando <ação>, então <resultado>.
Depende de: <ST-NN | nenhuma>
Notas: <spike necessário, pergunta em aberto, fora da fatia>
```

Feche com:
- **Cobertura**: tabela `RF-NN` → histórias. Requisitos não cobertos listados explicitamente.
- **Spikes**: incertezas a resolver com `technical-spike` antes de estimar.
- **Perguntas em aberto**.

## Próximo

- `domain-modeling` e `api-design` por história ou grupo de histórias.
- `testing` transforma os critérios de aceite em casos.
- `pull-request`: uma história por PR é um bom padrão.

## No Forja

No Forja, as histórias viram as tasks da spec: depois de `forja spec:plan <slug>`, rode `forja spec:tasks <slug>` e escreva cada `ST-NN` como uma seção de `specs/<slug>/tasks.md`, mantendo os IDs dos requisitos e os critérios de aceite. Uma corrida guardada por gates: `forja orchestrate "<objetivo>" --slug <slug>`.

## Evite

- Histórias horizontais por camada ("backend de X", "frontend de X").
- Histórias que são tarefas ("refatorar serviço", "escrever testes").
- Histórias sem critérios de aceite.
- Épicos rotulados como histórias.
- Estimar em horas ou prometer datas a partir dos tamanhos.
- Descartar em silêncio um requisito que não coube numa fatia.
