---
name: pull-request
description: Use quando abrir um pull request ou escrever a descrição dele: lê os commits e o diff do branch, escreve um título e um corpo com o porquê, o quê, como testar, riscos e rollback, e cria o PR só depois da aprovação.
---

# Pull Request

Um pull request pede a um revisor que confie numa mudança. A descrição dá a ele o que o diff não consegue: por que a mudança existe, onde olhar, como verificá-la e o que acontece se der errado.

A saída padrão é um **título e um corpo propostos**. Crie o PR só depois que o usuário aprovar.

## Convenções

- Entradas: os commits do branch (escritos com `commit-message`), os resultados de teste de `testing`, os IDs de requisito (`RF-NN`, `RN-NN`) de `requirements-gathering`, ADRs quando houve uma decisão.
- Idioma: o usado nos PRs ou commits recentes. Inglês quando não houver histórico.
- As regras do repositório prevalecem: `.github/pull_request_template.md`, `CONTRIBUTING.md`. Se houver um template, preencha-o em vez de usar o formato abaixo.

## Reúna o contexto

Somente leitura, antes de redigir:

1. `git branch --show-current` e o branch base (normalmente `main`).
2. `git log <base>..HEAD --oneline`: a história do branch.
3. `git diff <base>...HEAD --stat`, e depois o diff dos arquivos que carregam a mudança.
4. `git status`: trabalho sem commit significa que o branch não está pronto. Diga isso; não abra o PR.
5. Se o branch já foi enviado (`git rev-parse --abbrev-ref @{u}`).
6. PRs mesclados recentes (`gh pr list --state merged -L 5`), para o tom e o estilo de título.

## Título

- No formato Conventional Commits, como o assunto de um commit: `feat(reports): add CSV export`.
- Um branch com um commit só reutiliza o assunto desse commit.
- Um branch com vários commits recebe um assunto para o resultado inteiro, não para o último commit.
- `!` quando qualquer commit do branch for incompatível.

## Regras do corpo

- **Porquê primeiro.** Uma ou duas frases sobre o problema. Ligue o ticket e os IDs de requisito.
- **O quê**, no nível que o revisor precisa: a abordagem e os arquivos que a carregam. Não uma lista arquivo por arquivo.
- **Como testar**: passos que o revisor consegue rodar, com comandos e resultados esperados. Declare o que foi rodado e o resultado. Nunca afirme que os testes passaram sem rodá-los.
- **Riscos e rollback**: o que pode quebrar, quem é afetado, como desfazer (revert, feature flag, rollback de migração de `data-migrations`).
- **Mudanças incompatíveis**: o que quebra e como os consumidores migram.
- **Capturas de tela ou gravações** quando a interface muda.
- **Orientação de revisão** para PRs grandes: por onde começar, o que pode ser lido por cima.
- Mantenha fácil de varrer com os olhos: títulos e marcadores curtos. Apague as seções vazias.

## Tamanho

Um PR que não pode ser revisado de uma vez (cerca de 400 linhas alteradas de código real) deve ser dividido. Proponha a divisão por grupos de commits ou por fatia vertical de `backlog-slicing`. Arquivos gerados, lockfiles e movimentações não contam, mas mencione-os.

## Formato

```markdown
## Por quê
<problema, em uma ou duas frases>. Refs: <ticket>, <RF-NN>

## O quê
- <abordagem e mudança principal>
- <mudança secundária>

## Como testar
1. <comando ou passo> → <resultado esperado>

Rodado: <comando de teste> — <resultado>

## Riscos e rollback
- Risco: <o que pode quebrar, para quem>
- Rollback: <revert / flag / passo de migração>

## Mudanças incompatíveis
<o que quebra e como migrar>
```

## Fluxo

1. Reúna o contexto.
2. Redija título e corpo; sinalize uma divisão se o PR for grande demais.
3. Mostre-os ao usuário.
4. Com a aprovação: envie o branch se necessário (`git push -u origin <branch>`) e crie o PR com um heredoc:
   ```sh
   gh pr create --base <base> --title "<título>" --body-file - <<'EOF'
   <corpo>
   EOF
   ```
5. Mostre a URL do PR.

Crie como rascunho (`--draft`) quando o usuário disser que o trabalho não terminou. Nunca faça merge, force-push ou peça revisores, a menos que peçam.

## Próximo

Depois do merge, `release-notes` transforma os commits mesclados numa versão e num changelog.

## Evite

- Repetir a lista de commits como corpo.
- "Veja o código" ou uma descrição vazia.
- Afirmar que os testes passaram sem rodá-los.
- Esconder mudanças arriscadas num PR grande e não relacionado.
- Inventar IDs de ticket ou capturas de tela.
- Abrir o PR, enviar o branch ou pedir revisores sem aprovação.
- Ignorar o template de PR do repositório.
