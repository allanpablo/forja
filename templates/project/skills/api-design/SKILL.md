---
name: api-design
description: Use quando desenhar ou revisar uma API HTTP: deriva recursos do modelo de domínio, define métodos, códigos de status, modelo de erro, paginação, idempotência, versionamento e autorização por endpoint, e rascunha um contrato OpenAPI.
---

# Design de API

Uma API é um contrato que sobrevive à sua primeira implementação. Os clientes vão depender de cada campo, código de status e erro que você expuser, então o momento mais barato de acertá-los é antes de o primeiro cliente existir.

A saída padrão é uma **especificação de endpoints e um esqueleto OpenAPI 3.1**. Escreva código de handler só quando o usuário pedir.

## Convenções

- Entradas: agregados, invariantes e eventos de domínio de `domain-modeling`; `RF-NN` / `RNF-NN` de `requirements-gathering`; classificação de dados de `lgpd-compliance`.
- Nomes de recursos e campos na linguagem ubíqua, como no modelo de domínio. Escolha um estilo para os campos JSON (`camelCase` ou `snake_case`) e use-o em todo lugar.
- Siga o código existente: o estilo, o formato de erro e o versionamento de uma API que já existe prevalecem sobre os padrões desta skill. Quando a API for gRPC ou GraphQL, aplique as mesmas regras nos idiomas desse protocolo.
- Incógnitas vão para **Perguntas em aberto**. Não invente consumidores, limites ou SLAs.

## Do modelo de domínio aos recursos

- **Raiz do agregado** → recurso de coleção + item (`/orders`, `/orders/{orderId}`). Entidades dentro de um agregado são alcançadas pela raiz (`/orders/{orderId}/items`), nunca como recursos independentes de primeiro nível.
- **Objetos de valor** → objetos JSON aninhados, validados como um todo (`period: {start, end}`), nunca divididos em campos soltos.
- **Comportamento / transição de estado** que não é simples edição de campo → um sub-recurso de ação (`POST /orders/{orderId}/cancel`), não `PATCH status`. As invariantes da transição ficam no servidor.
- **Evento de domínio** → webhook ou payload de evento, quando um consumidor precisa reagir.
- **Violação de invariante** → `409` ou `422` com um tipo de erro específico, nunca `500`.
- **Modelos de leitura** que cruzam agregados → endpoints de consulta separados, somente leitura.

## Regras

- **Métodos**: `GET` seguro; `PUT` e `DELETE` idempotentes; `POST` cria ou executa uma ação; `PATCH` atualização parcial (JSON Merge Patch, a menos que o código use outro formato).
- **Códigos de status**: `200`, `201` + `Location`, `202` para trabalho assíncrono, `204`; `400` malformado, `401` não autenticado, `403` proibido, `404`, `409` conflito de estado, `412` pré-condição falhou, `422` violação de regra, `429` limite de taxa. `5xx` só para falhas do servidor.
- **Erros**: [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) `application/problem+json` com uma URI `type` estável por tipo de erro, mais `errors[]` com ponteiros de campo para validação. Os clientes decidem pelo `type`, nunca pelo `detail`.
- **Paginação**: baseada em cursor para listas que crescem (`?limit=&cursor=`, resposta com `nextCursor`); offset só para listas pequenas e estáveis. Sempre um `limit` máximo.
- **Filtros e ordenação**: só campos explicitamente permitidos (`?status=open&sort=-createdAt`).
- **Idempotência**: `POST` que cria ou cobra aceita `Idempotency-Key`; o servidor guarda a primeira resposta por chave durante uma janela declarada.
- **Concorrência**: `ETag` + `If-Match` em atualizações de agregados editados por vários atores; `412` quando não bater.
- **Tempo e dinheiro**: timestamps em RFC 3339 UTC; dinheiro como `{amount: "10.50", currency: "BRL"}` com string decimal, nunca float.
- **IDs**: strings opacas. Nunca exponha IDs sequenciais do banco quando eles revelam volume ou permitem enumeração.
- **Versionamento**: mudanças aditivas não precisam de versão nova. Mudanças incompatíveis (remover ou renomear campos, mudar tipos ou significado, nova entrada obrigatória) precisam de uma nova versão principal (`/v2` ou um header, seguindo o código) e de uma janela de descontinuação com os headers `Deprecation` e `Sunset`.
- **Autorização**: declare, por endpoint, quem pode chamá-lo e quais recursos pode ver. Verificações no nível do objeto (este usuário, este pedido) são obrigatórias, não só verificações de papel.
- **Dados pessoais**: marque os campos classificados por `lgpd-compliance`. Nunca os coloque em URLs ou query strings (eles acabam nos logs). Devolva só o que a finalidade exige.
- **Limites**: tamanho de requisição, tamanho de página e limites de taxa declarados explicitamente.

## Especificação de endpoint

```
### <MÉTODO> <caminho> — <finalidade na linguagem ubíqua>
Cobre: RF-NN, RN-NN
Auth: <quem pode chamar; regra no nível do objeto>
Requisição: <corpo / parâmetros, com campos obrigatórios e validação>
Respostas:
- 2xx: <formato>
- 4xx: <status> <tipo de problem> — <quando>
Idempotência / concorrência: <chave, ETag, ou nenhuma>
Dados pessoais: <campos e classificação, ou nenhum>
```

Depois, o esqueleto OpenAPI 3.1: `paths`, `components.schemas` para cada recurso e objeto de valor, `components.responses` para os tipos de problem compartilhados, e `securitySchemes`.

Feche com **Verificação de mudanças incompatíveis** (ao alterar uma API existente: cada mudança classificada como aditiva ou incompatível) e **Perguntas em aberto**.

## Próximo

- `data-migrations` para o armazenamento por trás dos recursos.
- `threat-modeling` usa os endpoints e as fronteiras de confiança.
- `testing` transforma cada caso de resposta em testes de handler.
- `architecture-decision-record` para escolhas como esquema de versionamento ou REST vs. gRPC.

## Evite

- Um endpoint por tabela do banco, ou expor o esquema de armazenamento como API.
- Verbos nos caminhos de recurso para CRUD (`/getOrders`, `/createOrder`).
- `200` com um erro no corpo.
- Booleanos que vão virar estados (`isCancelled` → `status`).
- Vazar stack traces, SQL ou IDs internos nos erros.
- Mudanças incompatíveis sem versão nova e janela de descontinuação.
- Desenhar para clientes hipotéticos. Desenhe para os requisitos declarados.
