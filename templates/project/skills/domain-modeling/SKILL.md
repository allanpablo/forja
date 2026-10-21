---
name: domain-modeling
description: Use quando modelar um domínio a partir de dados e funcionalidades propostos: sugere agregados, entidades e objetos de valor com propriedades tipadas, métodos derivados e invariantes.
---

# Modelagem de Domínio

Transforma dados e funcionalidades propostos num modelo tático de domínio: agregados, entidades, objetos de valor, propriedades tipadas, comportamentos e regras de consistência.

A saída é uma **especificação do modelo**, não uma implementação. Não gere código além de assinaturas de tipos, a menos que o usuário peça.

## Convenções

- Sempre escreva os termos de modelagem em pt-BR seguidos do en-US: Agregado (Aggregate), Raiz do Agregado (Aggregate Root), Entidade (Entity), Objeto de Valor (Value Object), Invariante (Invariant), Política (Policy), Evento de Domínio (Domain Event), Contexto Delimitado (Bounded Context), Linguagem Ubíqua (Ubiquitous Language).
- Nomeie tipos, propriedades e métodos na linguagem ubíqua do usuário (no idioma em que o domínio do usuário fala).
- Use os tipos da linguagem do código existente por padrão, a menos que o usuário indique outra linguagem. Os mapeamentos abaixo são para TypeScript.

## Princípio central

Não dá para modelar o que você não entende. Uma regra de negócio errada não é salva por padrão nenhum. Antes de classificar qualquer coisa, entenda o domínio; o que não foi dito precisa ser marcado como **suposição** ou **pergunta**, nunca inventado como fato.

## Processo

### 1. Extrair a linguagem ubíqua
A partir dos dados e funcionalidades informados, liste os substantivos (candidatos a conceitos), os verbos (candidatos a comportamentos) e as regras explícitas ou implícitas. Identifique termos ambíguos (por exemplo, um "usuário" que é ao mesmo tempo credencial, cliente e funcionário) e separe-os.

### 2. Delimitar contextos
Agrupe conceitos em Contextos Delimitados quando o mesmo termo carrega significados ou regras diferentes. Um contexto é uma fronteira de **modelo**, não de implantação: pode viver num monólito como pasta/módulo. Não proponha microsserviços por causa disso.
Quando o domínio ainda não estiver claro, rode `event-storming` antes. Para mapear como os contextos se relacionam (Kernel Compartilhado, Camada Anticorrupção, Cliente–Fornecedor…), use `bounded-context-mapping`.

### 3. Classificar cada conceito

| Conceito | Critério |
|---|---|
| Entidade | Tem uma identidade que persiste através das mudanças; tem ciclo de vida. |
| Objeto de Valor | Definido só pelos seus atributos; imutável; igualdade por valor; carrega a própria validação e comportamento. |
| Agregado | Fronteira de consistência transacional. A raiz é o único ponto de entrada para mudanças. |

Heurísticas:
- Mantenha os agregados pequenos. Se duas coisas não precisam estar consistentes na mesma transação, são agregados separados.
- Agregados referenciam outros agregados **por ID**, nunca pelo objeto.
- Promova um primitivo a Objeto de Valor quando houver uma regra, formato ou comportamento associado (por exemplo, CPF/CNPJ, Email, Dinheiro, Período). Sem regra, mantenha o primitivo; não crie objetos de valor por ritual.
- Pares de campos que só fazem sentido juntos (início/fim, valor/moeda, latitude/longitude) são fortes candidatos a Objeto de Valor.

### 4. Tipar as propriedades
Para cada propriedade, defina nome, tipo, se é obrigatória e sua origem (informada, derivada, gerada pelo sistema).

Mapeamentos padrão em TypeScript:
- Identificador: tipo com marca (branded) sobre `string` (por exemplo, `type ProjectId = string & { readonly __brand: 'ProjectId' }`), para que um `ProjectId` não seja aceito onde se espera um `CustomerId`.
- Data/hora: `Date` tratado como instante em UTC (ou `Temporal` onde o projeto já o usa); data sem horário, quando relevante, como objeto de valor próprio.
- Duração: objeto de valor ou número em milissegundos com a unidade no nome (`durationMs`).
- Dinheiro: objeto de valor `Money` com o valor em unidades menores (centavos) como `bigint` ou inteiro seguro, mais a moeda. Nunca número de ponto flutuante.
- Enumerações/estados: união de literais de string (`'open' | 'closed'`), ou o padrão que o código já usa.
- Opcional: `?`/`undefined` só quando a ausência tem significado no domínio.

### 5. Definir comportamentos
- **Métodos derivados**: calculados a partir das propriedades, nunca armazenados (por exemplo, `Period.durationMs(): number` = fim − início; `Period.contains(at: Date): boolean`).
- **Comportamentos de domínio**: verbos da linguagem ubíqua que mudam o estado (por exemplo, `Project.close(at: Date): Result<void, ProjectError>`, ou lançando um erro de domínio tipado, conforme o padrão do código), em vez de setters genéricos. Evite modelos anêmicos.
- Transições de estado: descreva a máquina de estados sempre que houver um status.

### 6. Definir invariantes
Para cada regra de consistência, enuncie:
- a regra em linguagem de negócio;
- onde ela é garantida (construtor do Objeto de Valor, método da Raiz do Agregado);
- quando é verificada (na criação, numa transição específica, sempre).

Exemplo: "O fim não pode ser antes do início" → garantida na criação de `Period`; um `Period` inválido não pode existir.

Prefira tornar os estados inválidos irrepresentáveis com Objetos de Valor a espalhar validações.

### 7. Extrair políticas
Regras de negócio que variam, são configuráveis ou tendem a mudar (percentuais, limites, critérios de elegibilidade) viram uma Política explícita e nomeada, em vez de condicionais enterradas nos métodos. Quem procurar "onde esse limite está definido" deve encontrá-lo pelo nome.

### 8. Eventos de domínio (opcional)
Sugira Eventos de Domínio só quando outra parte do sistema precisar reagir a um fato. Nomeie-os no passado (`ProjectClosed`). Não proponha Event Sourcing ou CQRS sem uma necessidade concreta.

## Formato de saída

```
## Contexto: <Nome>

### Agregado: <Nome> (raiz: <Entidade>)
Responsabilidade: <uma frase>

**Propriedades**
| Propriedade | Tipo | Obrigatória | Origem | Notas |

**Métodos derivados**
- `nome(): Tipo` — <cálculo>

**Comportamentos**
- `verbo(params): Result<…>` — <efeito e transição>

**Invariantes**
- <regra> — garantida em <onde>, verificada <quando>

#### Entidades internas / Objetos de Valor
<mesma estrutura, enxuta>

### Políticas
- <Nome>: <regra, parâmetros>

### Suposições e perguntas em aberto
- <o que foi suposto e precisa ser validado com o negócio>
```

Sempre feche com **Suposições e perguntas em aberto**. Elas fazem parte do modelo, não são um apêndice: mostram onde ainda falta conhecimento do domínio.

## No Forja

No Forja, o modelo de cada contexto fica em `memory/30-domains/<contexto>/context.md` (agregados, invariantes, políticas e o mapa de onde cada um vive no código). Depois de gravar, rode `forja sync:universal`; `forja memory:audit` verifica se o mapa aponta para código que existe.

## Evite

- Inventar regras de negócio e apresentá-las como fato.
- Um agregado gigante que guarda tudo.
- Um Objeto de Valor para cada primitivo, sem regra que o justifique.
- Setters genéricos em vez de comportamentos nomeados.
- Padrões aplicados por obrigação. Saber onde usá-los importa mais do que saber como.
- Gerar uma implementação completa sem que peçam.
