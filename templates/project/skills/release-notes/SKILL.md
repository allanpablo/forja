---
name: release-notes
description: Use quando gerar uma release ou escrever um changelog: coleta os commits desde a última tag, decide o incremento de versão semântica a partir do Conventional Commits, escreve as notas de release para os usuários e cria a tag só depois da aprovação.
---

# Notas de Release

As notas de release dizem a quem usa o software o que mudou **para essas pessoas**: o que dá para fazer agora, o que foi corrigido e o que elas precisam mudar. Não são um log de commits.

A saída padrão é uma **versão e uma seção de changelog propostas**. Edite o changelog, crie a tag ou publique uma release só depois que o usuário aprovar.

## Convenções

- Entradas: commits escritos com `commit-message` (Conventional Commits), PRs mesclados de `pull-request`.
- Versionamento: [Semantic Versioning](https://semver.org/). Changelog: [Keep a Changelog](https://keepachangelog.com/).
- Idioma: o usado no `CHANGELOG.md` existente. Inglês quando não houver um.
- As regras do repositório prevalecem: uma ferramenta de release existente (`release-please`, `semantic-release`, `changesets`) é dona do processo. Nesse caso, só redija o texto ou ajude a configurar a ferramenta.

## Reúna o contexto

1. `git describe --tags --abbrev=0`: a última tag de release. Nenhuma significa a primeira release.
2. `git log <ultima-tag>..HEAD --format='%h %s%n%b'`: assuntos **e** corpos, para pegar os rodapés `BREAKING CHANGE:`.
3. O `CHANGELOG.md`, se existir, para o formato e o tom.
4. PRs mesclados desde a tag (`gh pr list --state merged --search "merged:>=<data da tag>"`), para o contexto voltado ao usuário que os commits não têm.

## Incremento de versão

| Os commits desde a última tag contêm | Incremento |
|---|---|
| `!` ou um rodapé `BREAKING CHANGE:` | major |
| `feat` | minor |
| só `fix`, `perf` | patch |
| só `docs`, `test`, `ci`, `chore`, `build`, `style`, `refactor` | nenhuma release necessária; diga isso |

- Antes da `1.0.0`, uma mudança incompatível incrementa a versão minor e uma funcionalidade incrementa a patch. Pergunte se o projeto está pronto para a `1.0.0` em vez de decidir sozinho.
- Commits que não seguem Conventional Commits: leia o diff, classifique-os e liste-os como incertos.
- Pré-releases (`-rc.1`, `-beta.1`) só a pedido.

## Escrevendo as notas

- **Mudanças incompatíveis primeiro**, cada uma com o passo de migração.
- Agrupe o resto nas seções do Keep a Changelog: Added (`feat`), Fixed (`fix`), Changed (`perf`, mudanças de comportamento), Deprecated, Removed, Security. Use os nomes de seção em português quando o changelog do projeto já os usa (Adicionado, Corrigido, Alterado…).
- Reescreva cada entrada para os usuários: o efeito, não a implementação. `feat(reports): add CSV export` → "Os relatórios podem ser exportados em CSV."
- Junte vários commits numa entrada quando eles entregam uma mudança só.
- Descarte `ci`, `test`, `chore`, `build`, `style` e `refactor` puro, a menos que os usuários os percebam (por exemplo, uma versão mínima de runtime mais alta).
- Ligue o PR ou o ticket de cada entrada quando houver.
- Correções de segurança: declare o impacto e as versões afetadas. Não inclua detalhes de exploração antes de os usuários poderem atualizar.

## Formato

```markdown
## [<versão>] - <AAAA-MM-DD>

### ⚠ Mudanças incompatíveis
- <o que mudou>. Migração: <o que fazer>.

### Added
- <efeito visível ao usuário> (#<PR>)

### Fixed
- <o que estava quebrado e agora funciona> (#<PR>)

### Changed
- <mudança de comportamento ou de desempenho>
```

A seção nova vai no topo do `CHANGELOG.md`, abaixo de `## [Unreleased]` se esse título existir.

## Fluxo

1. Reúna o contexto.
2. Proponha a versão com os commits que a justificam, mais as notas.
3. Com a aprovação: atualize o `CHANGELOG.md` e os arquivos de versão que o projeto usa (`package.json`, `pyproject.toml` etc.), e faça o commit com `commit-message` (`chore(release): <versão>`).
4. Só se pedirem: `git tag -a v<versão> -m "<versão>"`, envie a tag, `gh release create v<versão> --notes-file -`.

## No Forja

No Forja, a entrada de cada versão no `CHANGELOG.md` abre com a subseção `### O que melhorou` (o diff de produto em relação à versão anterior, em linguagem de usuário) e só depois as seções técnicas. Esse bloco é reaproveitado como nota da release no GitHub, e o README é reconciliado na mesma entrega.

## Evite

- Colar o log de commits cru como notas de release.
- Detalhes de implementação com os quais os usuários não podem fazer nada.
- Esconder uma mudança incompatível dentro de "Changed".
- Incrementar a major numa mudança compatível, ou a patch numa funcionalidade nova.
- Criar tag, enviar ou publicar sem aprovação.
- Brigar com uma ferramenta de release existente usando passos manuais.
