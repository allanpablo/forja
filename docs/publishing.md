# Publicação do ForjaJS

O pacote npm é `forjajs`. A fonte TypeScript é compilada em `dist/`; a lista `files` do
package.json define o conteúdo distribuído. O workspace de produtos fica fora do repositório.

## Preparar uma versão

1. Revisar mudanças, atualizar versão em package.json e package-lock.json e escrever o changelog.
2. Executar tipos, testes e governança pelo core do Forja.
3. Commitar a entrega. O modo de publicação exige árvore Git limpa.
4. Executar doctor e o gate estrito do tarball na revisão que será publicada.

```bash
npm run types:check
npm test
npm run project:check
npm run tools:doctor
npm run release:check -- --publish
```

O gate constrói dist, empacota, instala em diretório isolado e verifica o pacote instalado.
O parecer vale para aquele conteúdo: mudanças posteriores exigem nova verificação.
Ferramentas opcionais ausentes são reportadas separadamente pelo doctor.

## Publicar a revisão aprovada

A publicação precisa de autorização do mantenedor e autenticação no npm. Nunca salvar tokens
no repositório. O comando de publicação executa prepublishOnly, que repete o gate estrito.

```bash
npm whoami
npm publish --access public --tag latest
npm view forjajs version dist-tags --json
```

Se a sessão expirou, o mantenedor renova o login com `npm login`. Se o npm exigir autenticação
adicional, concluir o fluxo oficial. Não contornar o gate com ignore-scripts.

Enviar o commit para o GitHub, aguardar o CI e criar a tag/release correspondente à versão
publicada. Não mover uma tag existente nem republicar uma versão imutável.

## Conteúdo e compatibilidade

Conferir os arquivos com `npm pack --dry-run --json`. O pacote inclui executáveis compilados,
memória e documentação distribuíveis, prompts e templates declarados em files. Credenciais,
node_modules, bancos e contextos privados não devem entrar no tarball.

A versão 4.0.0 altera costUsd desconhecido de zero para null no JSON de llm:run. As opções de
retomada, schema e checks são explícitas. Exemplos em [LLM Fit Loop](llm-fit-loop.md).
