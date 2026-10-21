---
name: threat-modeling
description: Use quando desenhar ou alterar um sistema, funcionalidade ou API que atravessa uma fronteira de confiança: mapeia os fluxos de dados, encontra ameaças com STRIDE, avalia o risco e transforma as mitigações em requisitos e casos de teste.
---

# Modelagem de Ameaças

Faz quatro perguntas, nesta ordem: o que estamos construindo, o que pode dar errado, o que vamos fazer a respeito e se fizemos um bom trabalho. É feita na fase de design, quando uma mitigação custa uma linha numa especificação em vez de uma reescrita.

A saída padrão é uma **tabela de ameaças com mitigações**. É uma revisão de design, não um teste de invasão; termina com o que ainda precisa de verificação.

## Convenções

- Entradas: atores e `RF-NN` / `RNF-NN` de `requirements-gathering`; endpoints e regras de autorização de `api-design`; classificação de dados de `lgpd-compliance`; ADRs de arquitetura.
- As mitigações viram requisitos (`RNF-NN`, IDs novos só via `requirements-gathering`) e casos de teste para `testing`.
- Escopo: uma funcionalidade ou mudança por vez. Um modelo do sistema inteiro só na primeira passada ou num redesenho grande.
- Não invente capacidades de atacantes nem incidentes. Incógnitas (hospedagem, exposição de rede, garantias de terceiros) vão para **Perguntas em aberto**.

## Processo

### 1. Modelar o sistema
Desenhe um diagrama de fluxo de dados (Mermaid ou uma lista) com:
- **Entidades externas**: usuários, administradores, sistemas de terceiros.
- **Processos**: serviços, jobs, funções.
- **Armazenamentos de dados**: bancos, caches, filas, buckets, logs.
- **Fluxos de dados** entre eles, rotulados com o que trafega (credenciais, dados pessoais, pagamentos).
- **Fronteiras de confiança**: onde o privilégio ou a propriedade muda (internet → API, API → banco, seu sistema → fornecedor).

As ameaças moram onde os fluxos cruzam fronteiras. Marque esses fluxos.

### 2. Encontrar ameaças com STRIDE

| Ameaça | Viola | Pergunta | Mitigação típica |
|---|---|---|---|
| **S**poofing (falsificação de identidade) | Autenticação | Alguém consegue se passar por outro usuário ou serviço? | Autenticação forte, MFA, mTLS, tokens assinados com expiração curta |
| **T**ampering (adulteração) | Integridade | Os dados podem ser alterados em trânsito ou em repouso? | TLS, validação de entrada, assinaturas, constraints, escrita com privilégio mínimo |
| **R**epudiation (repúdio) | Não repúdio | Alguém pode negar uma ação que não conseguimos provar? | Log de auditoria com ator, horário e objeto, somente acréscimo |
| **I**nformation disclosure (vazamento de informação) | Confidencialidade | Os dados podem chegar a quem não deveria vê-los? | Autorização no nível do objeto, criptografia, respostas mínimas, nada de segredos ou dados pessoais nos logs |
| **D**enial of service (negação de serviço) | Disponibilidade | Alguém consegue esgotar um recurso? | Limites de taxa e de tamanho, timeouts, cotas, limites de paginação |
| **E**levation of privilege (elevação de privilégio) | Autorização | Alguém consegue obter direitos que não deveria ter? | Verificações no servidor a cada requisição, negar por padrão, nada de atribuição em massa |

Aplique por elemento: entidades externas (S, R), processos (os seis), armazenamentos (T, I, D, e R para logs), fluxos de dados (T, I, D). Verifique também os suspeitos de sempre: autorização quebrada no nível do objeto (IDOR), injeção, SSRF, segredos no código ou nos logs, vulnerabilidades de dependências e padrões inseguros.

### 3. Avaliar o risco
Probabilidade (baixa/média/alta) × impacto (baixo/médio/alto), com uma linha de justificativa. O impacto sobre dados pessoais segue `lgpd-compliance` (dados sensíveis elevam o impacto).

### 4. Decidir
Por ameaça: **mitigar**, **eliminar** (remover a funcionalidade ou o dado), **transferir** (para um fornecedor, com o contrato declarado) ou **aceitar**. Um risco aceito precisa de um dono e de uma data de revisão, e pode merecer um ADR.

### 5. Validar
Cada mitigação tem uma verificação: um caso de teste, uma checagem de configuração ou um item de revisão. Uma mitigação sem verificação é uma esperança.

## Formato

```
## Escopo
<funcionalidade/mudança, em um parágrafo; o que está fora do escopo>

## Diagrama de fluxo de dados
<mermaid ou lista; fronteiras de confiança marcadas>

## Ameaças
| ID | Elemento / fluxo | STRIDE | Ameaça | Probabilidade | Impacto | Decisão | Mitigação | Verificação |
|---|---|---|---|---|---|---|---|---|
| T-01 | Internet → API: GET /orders/{id} | I | Usuário lê o pedido de outro trocando o ID | Alta | Alto | Mitigar | Verificação de dono no nível do objeto | Teste: ID de outro usuário devolve 404 |

## Riscos aceitos
| ID | Dono | Motivo | Revisar em |

## Perguntas em aberto
```

## Próximo

- `requirements-gathering` registra as mitigações como `RNF-NN`.
- `testing` recebe um caso por verificação.
- `observability` registra e alerta sobre os ataques que você mitigou (falhas de autenticação, acionamentos do limite de taxa).
- `architecture-decision-record` para riscos aceitos e escolhas de arquitetura de segurança.

## Evite

- Listar ameaças genéricas sem ligá-las a um elemento deste sistema.
- Mitigações sem verificação.
- Tratar verificações do lado do cliente como segurança.
- Aceitar risco sem um dono.
- Avaliar tudo como alto. Se tudo é crítico, nada é priorizado.
- Recomendar uma ferramenta ou produto como mitigação em vez do controle que ele oferece.
