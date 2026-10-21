---
name: commit-message
description: Use quando fazer commit de mudanças ou escrever uma mensagem de commit: lê o diff em stage, o nome do branch e o histórico do repositório, escreve uma mensagem no padrão Conventional Commits com tipo, escopo e assunto no imperativo, e faz o commit só depois da aprovação.
---

# Mensagem de Commit

Uma mensagem de commit explica **por que** uma mudança existe. O diff já mostra **o que** mudou. Um bom histórico permite a qualquer pessoa descobrir quando e por que um comportamento apareceu, e permite que ferramentas gerem changelogs e versões a partir dele.

A saída padrão é uma **mensagem proposta**. Rode `git commit` só depois que o usuário aprovar.

## Convenções

- Formato: [Conventional Commits](https://www.conventionalcommits.org/).
- Idioma: o usado no histórico recente (`git log`). Inglês quando não houver histórico.
- As regras do repositório prevalecem sobre esta skill: `commitlint.config.*`, `.gitmessage`, `.czrc`, `CONTRIBUTING.md`, ou um padrão claro no `git log`.

## Reúna o contexto

Somente leitura, antes de redigir:

1. `git status` e `git diff --staged`. Se nada estiver em stage, mostre o `git diff` e pergunte o que colocar em stage. Nunca rode `git add -A` por conta própria.
2. `git branch --show-current`: a finalidade do branch.
3. `git log --oneline -20`: idioma, tipos e escopos já usados, e se o repositório segue Conventional Commits.
4. `git log <base>..HEAD --oneline` (a base costuma ser `main`): o que o branch já contém, para o commit novo se encaixar na história.
5. Os arquivos de configuração do repositório listados em Convenções, se existirem.

## Finalidade do branch → sugestão de tipo

| Prefixo do branch | Tipo padrão |
|---|---|
| `feat/`, `feature/` | `feat` |
| `fix/`, `bugfix/` | `fix` |
| `hotfix/` | `fix` (diga no corpo o que estava quebrado em produção) |
| `refactor/` | `refactor` |
| `docs/` | `docs` |
| `test/` | `test` |
| `perf/`, `build/`, `ci/`, `chore/` | o mesmo do prefixo |
| `release/` | `chore(release)` |

O branch é uma **sugestão**; o diff manda. Um commit que só acrescenta testes em `feat/login` é `test`, não `feat`.

Um ID de ticket no nome do branch (`feat/ABC-123-login`) vai no rodapé como `Refs: ABC-123`. Nunca invente um.

## Tipos

| Tipo | Use quando |
|---|---|
| `feat` | Adiciona uma capacidade que o usuário ou quem chama consegue observar. |
| `fix` | Corrige um bug observável. |
| `refactor` | Muda a estrutura sem mudar o comportamento. |
| `perf` | Mesmo comportamento, mensuravelmente mais rápido ou mais leve. |
| `docs` | Só documentação. |
| `test` | Só adiciona ou corrige testes. |
| `build` | Sistema de build, dependências, empacotamento. |
| `ci` | Pipelines de CI e seus scripts. |
| `style` | Só formatação, sem mudar o significado do código. |
| `chore` | Manutenção que não se encaixa em nada acima. |
| `revert` | Reverte um commit anterior; referencie o hash dele no corpo. |

Quando dois tipos servirem, escolha o que descreve o efeito visível ao usuário: uma correção que exigiu uma refatoração é `fix`.

## Escopo

- O módulo, pacote ou pasta predominante na mudança (`auth`, `api`, `quality`).
- Reutilize escopos que já existem no histórico antes de criar um novo.
- Omita o escopo quando a mudança abranger o repositório inteiro. Nunca invente um só para preencher.

## Formato

```
<tipo>(<escopo>)!: <assunto>

<corpo>

BREAKING CHANGE: <o que quebra e como migrar>
Refs: <ticket>
```

- **Assunto**: no imperativo, ≤ 50 caracteres (limite rígido de 72), minúsculo depois dos dois-pontos, a menos que o histórico diga outra coisa, sem ponto final. Teste: "Se aplicado, este commit vai *<assunto>*".
- **Corpo**: só quando o porquê não fica óbvio pelo assunto. Motivação, trade-offs, efeitos colaterais. Quebre em 72 colunas. Não é uma lista de arquivos.
- **Mudança incompatível**: `!` depois do tipo/escopo **e** um rodapé `BREAKING CHANGE:`, para qualquer quebra em API, contrato, esquema, configuração ou CLI.
- **Trailers**: mantenha os que o repositório ou a ferramenta exigem (`Co-Authored-By`, `Signed-off-by`).

## Commits atômicos

Um commit, um motivo para mudar. Sinais de que o diff em stage deveria ser dividido:

- escopos não relacionados no mesmo diff;
- uma funcionalidade misturada com uma refatoração ou com formatação;
- o assunto precisa de "e" para ser honesto.

Proponha os grupos, cada um com sua mensagem e o comando para colocá-lo em stage (`git add <caminhos>`, ou `git add -p` para trechos no mesmo arquivo). O usuário decide; não coloque nada em stage por conta própria.

## Fluxo

1. Reúna o contexto.
2. Classifique tipo e escopo; verifique se cabe uma divisão.
3. Mostre a mensagem proposta (e a divisão, se houver).
4. Com a aprovação, faça o commit com um heredoc para o corpo manter a formatação:
   ```sh
   git commit -F - <<'EOF'
   <mensagem>
   EOF
   ```
5. Mostre `git log -1 --stat`.

Nunca `--amend`, `--no-verify` ou push, a menos que peçam. Se um hook falhar, reporte, corrija a causa e crie um commit novo.

## Próximo

`pull-request` descreve os commits do branch para revisão; `release-notes` os transforma numa versão e num changelog.

## Exemplos

| Situação | Mensagem |
|---|---|
| `feat/ABC-42-export` adiciona exportação em CSV | `feat(reports): add CSV export` + rodapé `Refs: ABC-42` |
| `hotfix/login-timeout` | `fix(auth): renew session before token expiry` + corpo com o sintoma em produção |
| Skills movidas para pastas de categoria | `refactor: group skills into category folders` |
| Endpoint renomeado | `feat(api)!: rename /users to /accounts` + `BREAKING CHANGE: clients must call /accounts` |

Num repositório com histórico em português, as mesmas mensagens seriam, por exemplo, `feat(reports): adiciona exportação em CSV`.

Proposta de divisão, quando uma skill nova e uma movimentação de pastas estão em stage juntas:

```
1. git add design/ quality/ compliance/ requirements/
   refactor: group skills into category folders
2. git add git/commit-message/
   feat(git): add commit-message skill
```

## Evite

- Passado ou terceira pessoa no assunto ("added", "adds", "adicionado").
- Assuntos vagos: "atualiza arquivos", "fixes", "wip", "mudanças".
- Listar arquivos no corpo.
- Misturar mudanças não relacionadas num commit.
- Inventar escopos ou IDs de ticket.
- Afirmar que os testes passam sem rodá-los.
- Fazer commit sem aprovação.
- Sobrepor as convenções do próprio repositório com os padrões desta skill.
