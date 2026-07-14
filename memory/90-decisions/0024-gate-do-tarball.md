# ADR-0024: Gate do tarball — o repositório mente sobre o pacote

- **Status**: accepted
- **Data**: 2026-07-14
- **Autor(es)**: Allan Pablo
- **Tags**: release, governance, npm, harness, ci

## Contexto

O ADR-0023 fechou a classe "erra sem avisar" **dentro do repositório**. Fora dele, na fronteira do
pacote publicado, a mesma classe seguia intacta — e já tinha cobrado três vezes:

| Onde | O que foi publicado | Consequência |
|---|---|---|
| ADR-0021 §2 | `better-sqlite3` como `devDependency` | Dez comandos com `ERR_MODULE_NOT_FOUND` numa instalação limpa. O `forja` sem argumentos funcionava — o help não carrega os scripts — e isso mascarou a quebra. |
| v1.1.1 | `otplib` e `qrcode` no tarball, **sem jamais existirem no git** | `npm publish` empacota o *disco*, não o commit. Um `npm install` casual entre a auditoria e o publish reescreveu o `package.json`. |
| v1.1.3 | `docs/dashboard.md` e o script `npm run dashboard`, sem a pasta `dashboard/` | Quem instalava recebia a documentação e o comando, sem o código. |

Três releases, três bugs, uma raiz: **no repo tudo resolve.** `node_modules` tem as devDeps, todo
arquivo está presente, o `cwd` é a raiz. Nada disso vale para quem roda `npm i -g forjajs`. Todos
os três foram descobertos *depois* do publish, na máquina de quem instalou.

O agente `.claude/agents/release-auditor.md` já descrevia essa classe com precisão cirúrgica — as
quatro variantes, o procedimento, os comandos exatos. **Não era conhecimento que faltava; era
execução.** Ele é um agente: prosa, opt-in, invocado por quem lembrar. Pelo critério do próprio
ADR-0021 — *"uma regra que depende de memória não é uma regra; é uma sugestão"* — aquilo não era
gate. Era a última fronteira do framework que ainda funcionava por disciplina.

## Decisão

**`release:check`**: o gate empacota, instala num diretório isolado, executa os comandos e reprova.

- **Grep não prova ausência; instalação prova.** O gate roda `npm pack` + `npm install` de verdade,
  fora do repo, sem herdar `NODE_PATH` nem o `node_modules` vizinho. Um gate que enxerga o repo
  mente verde.
- **Executar, não listar.** O `forja` sem argumentos passa mesmo com tudo quebrado. O gate roda
  comandos reais (`tools:doctor`, `code:status`, `query:universal`) na instalação limpa.
- **Reprovar por assinatura de loader, nunca por exit code.** Numa instalação limpa não há workspace
  nem `universal.db`, então `query:universal` sai com código ≠ 0 *legitimamente* — isso é o pacote
  **funcionando**. O que denuncia tarball quebrado é `ERR_MODULE_NOT_FOUND` / `ERR_DLOPEN_FAILED`.
  Reprovar por exit code reprovaria todo pacote saudável.
- **Dois modos.** Árvore suja é `warn` em dev (senão o gate é contornado) e `fail` sob `--publish`
  (senão repete-se a v1.1.1).
- **A aprovação é perecível.** A árvore é reconferida ao final: vale para aquele disco, naquele
  instante. Um `npm install` entre o check e o publish invalida tudo.
- **O runner é o mesmo do doctor.** `lib/core/checks.mjs` foi *extraído* de `health.mjs`, não
  copiado. Duas máquinas iguais divergem com o tempo — e divergência entre superfícies que deveriam
  concordar é exatamente o defeito que o ADR-0023 matou. Uma máquina, dois catálogos: `health.mjs`
  guarda o repo, `release.mjs` guarda o tarball.
- **O que o Forja *escreve* não é o que o Forja *executa*.** Duas camadas de defesa contra essa
  confusão, ambas descobertas em campo:
  1. `stripTemplateLiterals` — os geradores emitem `import { INestApplication } from
     '@nestjs/common'` dentro de crases. Como a linha começa com `import`, o parser casava.
  2. Só `bin/`, `lib/` e `scripts/` contam como código. `boilerplates/` também é publicado e também
     é `.js`, mas é **conteúdo**: o `next.config.js` de um boilerplate importa `next`, dependência
     do projeto do *usuário*. Na primeira execução real, o gate exigiu `npm i -S next` no framework.
- **O gate nunca publica.** Ele autoriza; `npm publish` continua sendo um ato humano deliberado.
- **`prepublishOnly`, jamais `prepack`.** O gate roda `npm pack`. Amarrá-lo ao `prepack` faria o
  `npm pack` do gate disparar o `prepack`, que chama o gate, que roda `npm pack`… `npm pack` **não**
  dispara `prepublishOnly`, e é por isso que ele é o único hook seguro.

## Alternativas consideradas

- **Manter o `release-auditor` como agente** — rejeitada: é o estado atual, e ele não impediu
  nenhum dos três bugs. Conhecimento correto que ninguém executa no momento certo é decoração.
- **Análise estática do tarball, sem instalar** — rejeitada: foi tentada à mão durante o estudo e
  produziu falso positivo em minutos (imports dentro de template literal). Grep não distingue código
  de texto; o interpretador distingue.
- **`--fix` que corrige `files[]`/`dependencies` sozinho** — rejeitada, mesma razão do ADR-0023: o
  gate diagnostica e prescreve. Editar o manifesto de publicação sem consentimento é a classe de
  risco oposta.
- **`deps-unused` como `critical`** — rejeitada: peso morto no tarball incomoda, não quebra.
  Reprovar um release por isso ensina o time a usar `--no-verify`.
- **Rodar o gate na matriz de três Nodes** — rejeitada: o custo é o `npm install` compilando o
  `better-sqlite3` do zero, e instalar três vezes não prova mais que instalar uma. O `tools:doctor`
  é que roda na matriz — o `native-abi` só faz sentido contra várias versões.

## Consequências

**Positivas**:
- Os três bugs históricos foram **reintroduzidos um a um e o gate reprovou os três**. Um gate que
  nunca viu a falha que promete pegar não está testado — está escrito. Este viu.
- A evidência do release passa a viver no log do CI, e não na memória de quem publicou.
- `release:check` e `tools:doctor` compartilham runner, vocabulário e contrato de exit code. Check
  novo é entrada nova num catálogo.

**Negativas / Trade-offs**:
- O gate é **lento** (dezenas de segundos): o custo é o build nativo do `better-sqlite3` na
  instalação limpa. Aceito — roda antes de publicar e no CI, nunca no pre-commit.
- `prepublishOnly` é a peça de risco alto: um falso positivo ali **impede publicar qualquer coisa**.
  Por isso entrou por último, depois de o gate rodar verde no CI. Se reprovar um release saudável
  uma única vez, o `tree-clean` estrito sai do `prepublishOnly` e fica só no CI.
- A análise estática é conservadora por escolha: import dinâmico e template literal não contam.
  Trocamos cobertura por ausência de falso positivo — um crítico que mente é pior que um warning
  honesto. A cobertura real vem do `smoke-commands`, que executa e não opina.

## Rastreamento

- Implementação: `lib/core/checks.mjs` (runner), `lib/core/release.mjs` (catálogo),
  `scripts/release-check.mjs`, `.github/workflows/ci.yml`, `test/release.test.js`
- Spec: `specs/release-gate/` (SPEC-010)
- ADRs relacionadas: ADR-0023 (mesma filosofia, fronteira anterior), ADR-0021 (a classe que ambos
  fecham), ADR-0020 (registry), ADR-0018 (ferramentas de processo)
