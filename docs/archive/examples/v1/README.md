# create-memory-nest-kit

Scaffold para projetos grandes com:
- memória modular para agentes (Codex, Claude Code, Gemini CLI, OpenCode)
- padrão de documentação viva
- backend API em NestJS por padrão
- tudo em pt-BR

## Uso local

`node ./bin/create-memory-nest-kit.js meu-projeto`

## Uso via npx (GitHub)

Após publicar no GitHub:

`npx github:SEU_USUARIO/create-memory-nest-kit meu-projeto`

## Uso via npx (npm)

Após publicar no npm:

`npx create-memory-nest-kit meu-projeto`

## Flags

- `--force`: sobrescreve arquivos existentes
- `--only-memory`: gera apenas a estrutura de memória
- `--no-gitkeep`: não cria .gitkeep em diretórios vazios

## Estrutura gerada

- `memory/` (governança, arquitetura, domínios, delivery, ADR)
- `prompts/project-prompt-base.md`
- `AGENTS.md`
- `backend/` com base NestJS
