# Spec: project-upgrade

- **ID**: SPEC-018
- **Status**: done
- **Owner**: apk
- **ADRs relacionadas**: ADR-0020 (core/registry), ADR-0024 (isolamento em tmp — o padrão do gate)

## 1. Problema

O framework **gera** projetos, mas nunca soube **atualizar** um já gerado. Quando o Forja evolui —
uma pasta de memória nova (`70-summaries/`), um agent novo, um config multi-IA novo — quem gerou numa
versão antiga fica preso nela. A única saída era regerar (e perder o código) ou copiar peças na mão
(e esquecer quais). É a metade que falta de todo scaffolder.

## 2. Proposta de valor

Um projeto gerado consegue **incorporar as peças novas do scaffold** sem regerar e sem risco: o
comando traz o que falta, e **nunca** toca no que já existe (onde mora a edição do usuário).

## 3. User stories

- **Como** dono de um projeto gerado numa versão antiga, **quero** puxar as peças novas do framework,
  **para que** eu não fique preso na versão em que gerei nem perca meu código regerando.
- **Como** dev cauteloso, **quero** um dry-run antes de qualquer escrita, **para que** eu veja
  exatamente o que será adicionado.

## 4. Critérios de aceite (Definition of Done)

- [x] AC-1: `forja project:upgrade` gera um scaffold fresco num tmp isolado, faz o diff contra o
      projeto e lista **só os arquivos que faltam** (dry-run por padrão).
- [x] AC-2: **Aditivo, nunca sobrescreve.** Um arquivo que já existe no projeto não é listado nem
      tocado — é território do usuário. Provado em teste (edição preservada sob `--apply`).
- [x] AC-3: `--apply` copia as peças novas, criando diretórios; reporta quantas.
- [x] AC-4: `--project <path>` (default `cwd`); reprova cedo se o alvo não parece um projeto Forja
      (sem `AGENTS.md`). Limpa o tmp sempre.
- [x] AC-5: Lógica pura e testável (`lib/project-upgrade.ts`), com fixtures.

## 5. Escopo

**Dentro**: adicionar arquivos de scaffold ausentes (memória, agents, prompts, skills, configs).

**Fora** (explícito — a fronteira de segurança):
- **Sobrescrever ou fazer merge de arquivos existentes.** É onde vive a edição do usuário; MVP nunca
  toca. Um "upgrade com 3-way merge" é trabalho de outra spec, com muito mais risco.
- Migrar dados (memória indexada, `.context`) — são runtime, ficam de fora do diff.
- Atualizar `package.json`/dependências do backend — é código do usuário.

## 6. NFRs / restrições

- **Segurança acima de tudo**: additive-only é a invariante. `applyUpgrade` reconfere `existsSync`
  antes de cada cópia (paranoia: jamais sobrescreve).
- **Isolamento**: o scaffold fresco nasce num tmp com ambiente limpo (`NODE_PATH`/`npm_config_*`
  removidos — a lição do `release:check`), e o tmp é limpo sempre.

## 7. Métricas de sucesso

Um projeto gerado numa versão antiga incorpora as peças de uma versão nova sem perder nenhuma linha
de código do usuário — e o dono revê o diff antes de commitar.
