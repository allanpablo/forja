---
name: testing
description: Use quando planejar ou escrever testes em qualquer linguagem: transforma critérios de aceite, invariantes de domínio, métodos derivados, transições de estado e políticas em casos de teste, segue os próprios idiomas de teste do código e impõe um fluxo de mudança seguro contra regressões.
---

# Testes

Testes são um seguro contra regressão: o que funcionava ontem precisa continuar funcionando depois da mudança de hoje. Compilar não é evidência de correção, inclusive com tipos estáticos.

A saída padrão é um **plano de testes** (casos em Dado/Quando/Então). Escreva código de teste só quando o usuário pedir.

Esta skill é agnóstica de linguagem: decide **o que** testar e **onde**. **Como** escrever segue os idiomas do código. Uma skill de linguagem (por exemplo, `ts-testing`) acrescenta os idiomas dessa linguagem; use as duas juntas.

## Convenções

- Termos de modelagem em pt-BR seguidos do en-US, como na skill `domain-modeling`.
- Nomes dos casos na linguagem ubíqua do usuário.
- Entradas: critérios de aceite de `requirements-gathering`, o modelo de `domain-modeling`.

## Siga o código existente

Antes de planejar ou escrever testes, leia os que já existem. Acompanhe:

- O framework de testes, o executor e o estilo de asserção já usados. Não introduza outro.
- Localização e nomes dos arquivos (`foo.test.ts`, `foo.spec.ts`, `foo_test.go`, `test_foo.py`, `FooTest.java`, pasta `tests/`…).
- Como fakes, fixtures e dados de teste são construídos.
- Como os testes de integração ficam separados da suíte rápida (tags, marcadores, pastas, comandos separados).
- Os comandos que o CI executa.

Quando o código ainda não tem testes, use as ferramentas padrão da linguagem e suas convenções mais comuns, com o mínimo de dependências.

## Fluxo de mudança

Aplique a toda mudança, antes de discutir técnica:

1. **Correção de bug**: escreva um teste que reproduza o bug e falhe. Corrija. O teste passa e fica como proteção.
2. **Funcionalidade nova**: os testes vão na mesma mudança. Sem testes, não está pronto.
3. **Código legado sem testes**: não planeje uma campanha de cobertura. Cubra o que você está mexendo agora, um teste por vez.
4. **Percentual de cobertura não é meta.** Cubra regras, limites e bugs passados; pule trivialidades.
5. **Atualização de dependência ou de runtime**: rode a suíte inteira antes de mesclar.
6. **Incerteza sobre uma abordagem**: escreva o teste primeiro. É a prova de conceito mais barata.

O CI roda a suíte inteira. Localmente, rode só os módulos que você está mexendo.

## O que testar, por camada

| Camada | Tipo de teste | Dependências |
|---|---|---|
| Domínio (objetos de valor, entidades, agregados, políticas) | Testes unitários puros. É aqui que mora a maior parte dos testes. | Nenhuma. Sem mocks. |
| Aplicação (casos de uso, serviços de domínio) | Testes unitários de orquestração e de regras entre agregados. | Fakes em memória escritos à mão, implementando as interfaces de repositório. |
| Infraestrutura (repositórios, filas, clientes externos) | Testes de integração contra dependências reais (por exemplo, o banco real num container). | Serviços reais, isolados por teste. |
| HTTP/transporte | Testes de handler: códigos de status, contrato do payload, mapeamento de erros. | Casos de uso substituídos por fakes. |

Prefira fakes a mocks: um fake verifica o resultado; um mock verifica a sequência de chamadas e quebra a cada refatoração.

## Do modelo de domínio aos casos de teste

Quando existe um modelo de `domain-modeling`, derive os casos de forma mecânica:

- **Construtor de objeto de valor**: um caso de aceitação por formato válido. Um caso de rejeição por invariante. Limites dos dois lados (por exemplo, fim == início aceito, fim um milissegundo antes do início rejeitado).
- **Invariante**: pelo menos um caso que tente quebrá-la por cada caminho público que poderia quebrá-la, e um caso exatamente no limite.
- **Método derivado**: valor típico, valor zero/vazio e limite (por exemplo, a duração de um período instantâneo é zero; `contains` no início e no fim).
- **Comportamento / transição de estado**: uma tabela de transições. Toda transição válida tem sucesso e muda o estado. Toda transição inválida, a partir de cada estado, devolve erro e deixa o agregado inalterado.
- **Política**: limites dos parâmetros. Logo abaixo do limite, exatamente nele e logo acima. Se a política é configurável, teste com pelo menos duas configurações.
- **Regra entre agregados**: teste na camada de aplicação usando fakes.
- **Evento de domínio**: verifique que ele é emitido exatamente quando o fato acontece, e não em operações rejeitadas.
- **Critério de aceite**: cada Dado/Quando/Então de `requirements-gathering` vira pelo menos um caso na camada onde o comportamento mora.
- **Suposições e perguntas em aberto**: sem testes. Liste-as como pendentes até o negócio confirmá-las.

## Práticas

- Um teste por comportamento, nomeado pelo comportamento. Agrupe casos do mesmo comportamento (tabelas, testes parametrizados).
- Teste a API pública. Alcance o interno só quando não houver caminho público.
- **Determinismo**: tempo, IDs e aleatoriedade são injetados, nunca lidos de globais dentro do domínio.
- Verifique tipos ou categorias de erro, nunca o texto da mensagem.
- Fixtures em arquivos para entradas grandes; golden files para saídas grandes, com um jeito de regenerá-los.
- Testes baseados em propriedades ou fuzzing para parsers e construtores de objetos de valor que aceitam entrada externa (CPF/CNPJ, e-mails, documentos).
- Testes de integração separados da suíte rápida, para que ela continue rápida. Cada teste é dono dos seus dados: uma transação revertida no fim, ou um schema dedicado.
- Benchmarks só quando desempenho é um requisito declarado.

## Formato do plano

```
## <Elemento> (<Objeto de Valor | Agregado | Política | Caso de uso>)

| Caso | Dado | Quando | Então |
|---|---|---|---|
| <nome na linguagem ubíqua> | <estado/entrada> | <ação> | <resultado ou erro esperado> |

Camada: <domínio | aplicação | infraestrutura | transporte>
Dependências: <nenhuma | fakes: X, Y | reais: <banco, fila…>>
```

Feche com **Pendentes**: regras que dependem de suposições não confirmadas e por isso ainda não têm testes.

## No Forja

No Forja, os critérios de aceite estão em `specs/<slug>/spec.md` (§4, `AC-n`). Nomeie os casos citando a spec e o critério que cobrem, `SPEC-NNN AC-N` (ex.: `test('SPEC-004 AC-2: estorno parcial', …)`), e confira com `forja spec:trace <slug>`: critérios sem teste e citações a critérios que não existem mais aparecem ali. Registre a evidência na seção "Evidências e estado real" da spec.

## Evite

- Testar getters, construtores triviais, código gerado ou o próprio framework.
- Chamar funções privadas diretamente para atingir cobertura.
- Mocks que verificam a ordem das chamadas em vez dos resultados.
- Testes que dependem da ordem de execução, do relógio real ou de dados compartilhados.
- Um teste gigante cobrindo vários comportamentos.
- Introduzir um framework ou estilo de teste que o código não usa.
- Pular testes para cumprir prazo. Corte escopo.
- Gerar código de teste sem que peçam.
