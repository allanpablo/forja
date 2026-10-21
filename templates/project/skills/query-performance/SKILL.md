---
name: query-performance
description: Use quando uma consulta SQL está lenta ou um banco está sob carga: lê planos de EXPLAIN ANALYZE, encontra a causa (índices faltando, estimativas ruins, predicados não sargáveis, N+1, paginação por offset) e propõe índices e reescritas ordenados, com verificação.
---

# Desempenho de Consultas

Uma consulta lenta é um problema de plano até prova em contrário. O plano mostra o que o banco de fato fez. Adivinhar índices sem lê-lo aumenta o custo de escrita e muitas vezes não ajuda.

A saída padrão é um **diagnóstico e correções ordenadas**. Crie índices ou altere código só quando o usuário pedir, e crie índices via `data-migrations`.

## Convenções

- O dialeto padrão é PostgreSQL. Nomeie o dialeto quando o conselho for específico dele.
- Entradas: a consulta (com valores reais dos parâmetros), o plano, o esquema e os índices (de `data-migrations`), o tamanho das tabelas e com que frequência a consulta roda (de `observability` ou `pg_stat_statements`).
- Nunca rode `EXPLAIN ANALYZE` em escritas (`INSERT`/`UPDATE`/`DELETE`) em produção. Ele as executa. Use uma transação com `ROLLBACK`, ou uma cópia.

## Reúna

1. A consulta com parâmetros realistas, não placeholders.
2. `EXPLAIN (ANALYZE, BUFFERS, VERBOSE)` sobre dados do tamanho da produção. Um plano de um banco de desenvolvimento com 100 linhas não diz nada.
3. `\d+ <tabela>` para colunas e índices; quantidade de linhas.
4. Frequência × duração do `pg_stat_statements`: uma consulta de 5 ms rodando 10.000 vezes por minuto importa mais do que um relatório mensal de 2 s.

## Leia o plano

Leia de baixo para cima; encontre o nó onde vai a maior parte do tempo (`actual time` × `loops`).

| Sinal | Causa provável |
|---|---|
| Estimativa `rows=` diferente de `actual rows` em 10× ou mais | Estatísticas desatualizadas ou insuficientes; colunas correlacionadas |
| `Seq Scan` com filtro seletivo numa tabela grande | Índice faltando, ou um predicado que o índice não consegue usar |
| `Rows Removed by Filter` grande | Índice nas colunas erradas, ou nenhum índice |
| `Nested Loop` com muitos `loops` sobre um lado interno grande | Estimativa ruim; índice faltando na chave do join |
| `Sort` / `Hash` com `external merge` ou `Disk:` | `work_mem` pequeno demais, ou ordenando mais linhas que o necessário |
| `Buffers: read` alto vs. `hit` | Cache frio ou dados demais tocados |
| `Index Scan` seguido de muitas leituras do heap | Um índice de cobertura (`INCLUDE`) permitiria um `Index Only Scan` |
| Muito tempo em `Limit` sobre `Offset` | Paginação por offset varrendo as linhas puladas |

## Causas comuns e correções

- **Índice faltando**: índice composto com as colunas de igualdade primeiro, depois as de intervalo/ordenação. Índice parcial (`WHERE status = 'open'`) quando as consultas miram um subconjunto pequeno.
- **Predicado não sargável**: funções ou casts sobre a coluna (`WHERE lower(email) = …`, `WHERE created_at::date = …`), curinga no início `LIKE '%x'`, divergência implícita de tipo. Reescreva, ou use um índice de expressão.
- **Estatísticas desatualizadas**: `ANALYZE <tabela>`; aumente o alvo de estatísticas em colunas assimétricas; estatísticas estendidas para colunas correlacionadas.
- **N+1**: uma consulta por linha vinda do código da aplicação. Agrupe com `IN`/`ANY($1)` ou um join. Aparece nos traces, não em planos isolados.
- **Paginação por offset**: troque por keyset (`WHERE (created_at, id) < ($1, $2) ORDER BY created_at DESC, id DESC LIMIT n`), alinhado à paginação por cursor de `api-design`.
- **Dados demais**: `SELECT *` em linhas largas, `LIMIT` faltando, agregações sobre o histórico inteiro. Selecione as colunas necessárias; pré-agregue se for um relatório.
- **`OR` entre colunas** impedindo o uso do índice: reescreva como `UNION ALL`.
- **Subconsultas correlacionadas**: reescreva como joins ou `LATERAL`.

## Verifique

Rode de novo o mesmo `EXPLAIN (ANALYZE, BUFFERS)` depois da mudança, sobre os mesmos dados, e compare tempo e buffers. Verifique o custo de escrita de qualquer índice novo em tabelas quentes. Remova os índices que a mudança deixou sem uso (`pg_stat_user_indexes.idx_scan = 0` num período representativo).

## Formato

```
## Consulta
<SQL, parâmetros, frequência, duração atual>

## Diagnóstico
| Nó do plano | Observação (estimado vs. real, tempo, buffers) | Causa |

## Correções (ordenadas por efeito esperado / custo)
| # | Correção | Efeito esperado | Custo (sobrecarga de escrita, migração, mudança de código) |

## Verificação
<plano antes → depois; números>
```

## Próximo

- `data-migrations` para criar índices (`CONCURRENTLY`) ou mudar o esquema.
- `observability`: SLI de latência do endpoint afetado, para confirmar o efeito em produção.

## Evite

- Adicionar índices sem ler o plano.
- Planos de dados pequenos ou não representativos.
- `EXPLAIN ANALYZE` sobre escritas em produção.
- Um índice por coluna em vez de um índice composto para a consulta.
- Hints de consulta ou ajustes do planejador como primeira correção.
- Afirmar uma melhora sem números de antes e depois.
