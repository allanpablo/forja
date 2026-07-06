# create-memory-nest-kit v0.2.0

Scaffold para projetos grandes com:
- memoria hierarquica e resumida
- suporte operacional para multiagentes
- handoff e continuidade de execucao
- API NestJS por padrao
- comunicacao em pt-BR

## Importante sobre 1M+ de tokens
Este kit **nao altera limite nativo** de contexto do modelo.
Ele permite operar em larga escala com segmentacao, resumo e handoff incremental.

## Uso local

`node ./bin/create-memory-nest-kit.js meu-projeto`

## Uso via npx (GitHub)

`npx github:SEU_USUARIO/create-memory-nest-kit meu-projeto`

## Uso via npx (npm)

`npx create-memory-nest-kit@latest meu-projeto`

## Flags

- `--force`: sobrescreve arquivos existentes
- `--only-memory`: gera apenas memoria + agents + skills
- `--no-gitkeep`: nao cria .gitkeep em diretorios vazios

## Scripts uteis no projeto gerado

- `node scripts/build-context-pack.mjs`
- `node scripts/append-handoff.mjs worker-a worker-b "titulo"`
