# Spec: gates

- **ID**: SPEC-020
- **Status**: done
- **Owner**: apk
- **ADRs relacionadas**: ADR-0023 (doctor como gate), ADR-0024 (release gate), ADR-0029 (project:smoke), ADR-0020 (core/registry)

## 1. Problema

O framework acumulou uma família de gates — `tools:doctor` (núcleo + coerência de doc + topologia),
`release:check` (tarball), `project:smoke` (projeto gerado). Cada um guarda uma fronteira, mas estão
**espalhados**: ninguém lembra de rodar os três antes de um PR, e a governança do Forja — que existe
justamente para não depender de memória — depende da memória de quem publica para *invocar* os gates.
É a mesma ironia do ADR-0021, um nível acima: os gates existem, mas rodá-los ainda é disciplina.

## 2. Proposta de valor

Um comando roda **todos os gates aplicáveis ao framework** e dá **um veredito só**. "A casa está
coerente?" deixa de ser quatro comandos lembrados e vira um: `forja check:all`.

## 3. User stories

- **Como** mantenedor, **quero** um comando que rode a bateria inteira antes do PR, **para que** eu
  não esqueça um gate e descubra a quebra no CI (ou depois).
- **Como** quem publica, **quero** `--full` que inclua os gates caros (tarball, build do gerado),
  **para que** o pré-release seja um comando, não um checklist.

## 4. Critérios de aceite (Definition of Done)

- [ ] AC-1: `forja check:all` roda os gates de coerência (o catálogo do `tools:doctor`) **+** o
      `project:smoke` (tier barato) e reporta **um veredito** (exit ≠ 0 se qualquer crítico falhar).
- [ ] AC-2: `--full` adiciona os gates caros: `release:check` (tarball) e `project:smoke --full`
      (instala + builda o backend gerado).
- [ ] AC-3: A saída **agrupa por gate** (núcleo & coerência / projeto gerado / tarball) e resume o
      pior status ao final — legível, não um despejo.
- [ ] AC-4: **Compõe os runners existentes** (`health`, `project-smoke`, `release`) — uma máquina,
      zero reimplementação de check. Reusa `worstStatus` de `checks.ts`.
- [ ] AC-5: Lógica de composição pura e testável (env/runners injetáveis; teste com fakes que
      devolvem status conhecidos, sem gerar projeto de verdade).

## 5. Escopo

**Dentro**: compor os gates do framework num comando com veredito único e tiers.

**Fora** (explícito):
- `memory:audit` — é gate de **projeto gerado** (precisa de `memory/30-domains` de produto), não do
  framework. Fica de fora do `check:all` do framework; roda no CI do projeto (ADR-0030).
- Reimplementar qualquer check — este comando só orquestra os catálogos que já existem.
- Substituir `tools:doctor`/`release:check`/`project:smoke` — eles seguem existindo, focados; o
  `check:all` é o agregador, não o dono.

## 6. NFRs / restrições

- **Custo consciente**: o tier barato inclui a geração de um projeto (`project:smoke`) — segundos, sem
  rede. O `--full` é minutos (empacota o tarball, `npm install` do backend). O tier certo para o
  momento certo, como no `release:check`.
- **Compatibilidade**: comando novo; não muda os gates que agrega.

## 7. Métricas de sucesso

Um `forja check:all` antes do PR pega uma quebra que passaria (um gate esquecido) — a prova de que
reunir a bateria num comando valeu. A governança do framework deixa de depender de lembrar quais
gates rodar.
