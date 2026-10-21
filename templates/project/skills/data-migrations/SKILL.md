---
name: data-migrations
description: Use quando desenhar um esquema relacional ou alterá-lo em produção: mapeia agregados para tabelas, garante invariantes com constraints, deriva índices dos padrões de consulta e planeja migrações sem downtime com um rollback por passo.
---

# Migrações de Dados

O esquema é a parte mais longeva de um sistema: o código é substituído, os dados ficam. Esta skill desenha o esquema a partir do modelo de domínio e planeja as mudanças para que a aplicação em execução nunca encontre um banco com que não consiga lidar.

A saída padrão é um **esquema e um plano de migração ordenado**. Escreva arquivos de migração só quando o usuário pedir, usando a ferramenta de migração do projeto.

## Convenções

- Entradas: agregados, objetos de valor e invariantes de `domain-modeling`; padrões de consulta de `api-design`; retenção e classificação de `lgpd-compliance`.
- Siga o código existente: o banco, a ferramenta de migração (Prisma Migrate, Drizzle Kit, TypeORM, Knex, `node-pg-migrate`, Flyway…), o estilo de nomes e a organização dos arquivos. Nunca misture ferramentas.
- O dialeto padrão é PostgreSQL. Diga quando um recurso é específico do dialeto.
- Volumes de dados ou tráfego desconhecidos vão para **Perguntas em aberto**: eles decidem se um passo precisa de lotes.

## Do modelo de domínio às tabelas

- **Agregado** → uma tabela raiz mais tabelas para as entidades internas, com chave estrangeira para a raiz e `ON DELETE CASCADE` só dentro do agregado. Um agregado é salvo numa transação.
- **Entre agregados**: referência por ID. Uma chave estrangeira serve dentro do mesmo banco; nunca faça cascata entre agregados.
- **Objeto de valor** → colunas na tabela do dono (`period_start`, `period_end`), ou uma coluna JSON só quando ele nunca é consultado pelas partes.
- **Invariantes** que o banco consegue garantir viram constraints: `NOT NULL`, `CHECK (period_end >= period_start)`, `UNIQUE`, chaves estrangeiras, exclusion constraints. O domínio também as verifica; a constraint é a última linha de defesa.
- **Concorrência otimista** (`ETag` em `api-design`) → uma coluna `version` incrementada a cada atualização.
- **Dinheiro**: `numeric(19,4)` mais uma coluna de moeda. **Tempo**: `timestamptz` em UTC.
- **Dados pessoais**: marque as colunas classificadas por `lgpd-compliance`; planeje como a retenção as exclui ou anonimiza.

## Índices

- Derive dos padrões de consulta reais (cada lista, filtro e ordenação em `api-design`), não de palpites.
- Chaves primárias e constraints únicas já são indexadas. Chaves estrangeiras não são no PostgreSQL: indexe-as quando você faz join ou exclusão por elas.
- Ordem das colunas num índice composto: colunas de igualdade primeiro, depois as de intervalo/ordenação.
- Todo índice deixa as escritas mais lentas. Cada um nomeia a consulta que atende.

## Mudanças sem downtime: expandir → migrar → contrair

As versões antiga e nova da aplicação rodam juntas durante um deploy. Todo passo precisa funcionar com as duas.

1. **Expandir**: adicione o que o código novo precisa, de forma retrocompatível (coluna nova anulável, tabela nova, índice novo criado de forma concorrente).
2. **Migrar**: implante código que escreve no antigo e no novo; preencha as linhas existentes em lotes; depois passe as leituras para a estrutura nova.
3. **Contrair**: depois que o código antigo sumir, remova a coluna ou tabela antiga numa release posterior.

Receitas:

| Mudança | Sequência segura |
|---|---|
| Adicionar uma coluna obrigatória | Adicionar anulável (ou com default constante) → preencher → `CHECK (col IS NOT NULL) NOT VALID` → `VALIDATE` → `SET NOT NULL` (o PostgreSQL 12+ pula a varredura completa) |
| Renomear uma coluna | Adicionar a nova → escrita dupla → preencher → ler a nova → remover a antiga. Nunca `RENAME` com tráfego ativo. |
| Mudar um tipo | Igual ao renomear, com uma coluna convertida |
| Adicionar um índice | `CREATE INDEX CONCURRENTLY` (fora de uma transação) |
| Adicionar uma chave estrangeira | `NOT VALID`, depois `VALIDATE CONSTRAINT` |
| Remover uma coluna | Parar de ler → parar de escrever → remover numa release posterior |

- Os preenchimentos rodam em lotes de tamanho limitado, são idempotentes e retomáveis, e nunca rodam dentro da transação da migração de esquema.
- Defina `lock_timeout` nas migrações para que um `ALTER` bloqueado falhe rápido em vez de enfileirar todo o tráfego atrás dele.

## Rollback

Cada passo declara o seu rollback. Passos de expansão se revertem removendo o que adicionaram. Passos de contração destroem dados: **não têm rollback** além de uma restauração, então só rodam depois que a versão nova estiver estável, e o plano diz isso.

## Formato

```
## Esquema
<DDL ou lista de tabelas: colunas, tipos, constraints, índices (cada um com a consulta que atende)>

## Plano de migração
| # | Release | Passo | Tipo (expandir/migrar/contrair) | Locks / risco de duração | Rollback |
|---|---|---|---|---|---|

## Perguntas em aberto
```

## Próximo

- `testing`: os testes de integração rodam as migrações contra um banco real e testam as constraints que espelham invariantes.
- `architecture-decision-record` para escolhas de banco ou de ferramenta de migração.

## Evite

- Uma migração que muda esquema e código no mesmo deploy de forma incompatível.
- Editar uma migração que já rodou em algum lugar. Escreva uma nova.
- Preencher milhões de linhas numa transação só.
- Floats para dinheiro; timestamps sem fuso horário.
- Índices sem uma consulta que precise deles.
- Exclusões em cascata entre agregados.
- Remover colunas na mesma release que deixa de usá-las.
