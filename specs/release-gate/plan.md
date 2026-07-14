# Plan: release-gate

- **Spec**: ./spec.md
- **Status**: approved
- **Criado em**: 2026-07-14

> Como vamos construir o que a spec define. Sem código aqui — só estrutura e decisões.

## 1. Abordagem técnica

**O runner já existe.** `runChecks({ checks, env })` em `lib/core/health.mjs` foi escrito genérico
— recebe a lista de checks por parâmetro e já é exercitado com fixtures nos testes. O gate de
release não precisa de máquina nova: precisa de **outro catálogo de checks** rodando na mesma
máquina.

Então extraímos o runner para `lib/core/checks.mjs` e deixamos dois catálogos: `health.mjs` (o
núcleo, fronteira *repo*) e `release.mjs` (o tarball, fronteira *pacote publicado*). Mesma
severidade, mesma cascata, mesmo contrato de `fix`. Uma máquina, duas fronteiras.

A diferença essencial em relação ao doctor: o gate de release **não inspeciona; ele instala**. Grep
não prova ausência — instalação prova. O `release-auditor` já diz isso, e é a razão de o gate ser
lento e de tudo bem ser lento.

## 2. Módulos afetados

| Caminho | Mudança | Risco |
|---|---|---|
| `lib/core/checks.mjs` | **criar** — runner extraído de `health.mjs` (`runChecks`, `worstStatus`) | M |
| `lib/core/health.mjs` | editar — passa a importar o runner; re-exporta para não quebrar consumidores | M |
| `lib/core/release.mjs` | **criar** — catálogo dos checks de tarball | M |
| `scripts/release-check.mjs` | **criar** — apresentação + exit code | B |
| `lib/core/registry.mjs` | editar — `release:check` (ADR-0020) | B |
| `package.json` | editar — `prepublishOnly` | **A** |
| `.github/workflows/ci.yml` | editar — steps `tools:doctor` e `release:check` | B |
| `.claude/agents/release-auditor.md` | reescrever — consome o gate, não reimplementa | B |
| `test/release.test.js` | **criar** — os três bugs históricos como fixture | B |

Risco alto no `prepublishOnly`: se ele falhar indevidamente, **ninguém consegue publicar**. É o
único ponto onde um falso positivo trava a operação inteira em vez de só incomodar.

## 3. Diagrama de fluxo

```
  npm run release:check [--publish]
            │
            ▼
  ┌─ preflight ───────────────────────────────────────┐
  │  árvore limpa?   --publish → fail   senão → warn   │  ← v1.1.1 morreu aqui
  └───────────────────────────────────────────────────┘
            │
            ▼
     npm pack  →  /tmp/forja-release-<pid>/
            │
            ▼
     npm init + npm i <tgz>        (isolado: sem NODE_PATH, sem node_modules do repo)
            │
            ▼
  ┌──────────── RELEASE_CHECKS[] (lib/core/release.mjs) ──────────┐
  │ id                severity  o que prova                        │
  │ tree-clean        critical* tarball == commit (*warn sem --publish)
  │ install           critical  o pacote instala do zero           │
  │ registry-scripts  critical  os 41 comandos existem no tarball  │
  │ smoke-commands    critical  os comandos EXECUTAM (não só help) │
  │                             reprova por stderr, não exit code  │
  │ deps-declared     critical  importado ⊆ dependencies           │
  │ deps-unused       warn      dependency que ninguém importa     │
  │ imports-resolve   critical  import relativo resolve no tarball │
  └───────────────────────────────────────────────────────────────┘
            │
            ▼
     re-check árvore limpa  ← a aprovação é perecível
            │
            ▼
     exit 0 / exit 1        +  limpa o /tmp
```

## 4. Contratos (API/CLI/Schema)

```js
// lib/core/checks.mjs  — o runner, sem opinião sobre o que checa
export async function runChecks(opts);   // { checks, scope, env } -> Result[]
export function worstStatus(results);    // -> 'ok' | 'warn' | 'fail'

// lib/core/health.mjs  — inalterado para quem consome
export { runChecks, worstStatus } from './checks.mjs';   // re-export: tools-doctor e o hook seguem iguais
export const CHECKS;                                     // os 7 do núcleo

// lib/core/release.mjs
export const RELEASE_CHECKS;
export async function withCleanInstall(fn);  // empacota, instala isolado, executa, limpa. Sempre limpa.
```

**CLI**:

| Comando | Árvore suja | Uso |
|---|---|---|
| `npm run release:check` | `warn` | Dev quer o smoke test sem commitar. Reprova o resto normalmente. |
| `npm run release:check -- --publish` | **`fail`** | `prepublishOnly` e CI de release. |

A distinção existe porque um gate que reprova todo desenvolvimento local vira um gate que se
contorna — a lição que o CI nos deu na SPEC-009, quando `memory-db` reprovava qualquer clone novo.
Mas na hora de publicar, árvore suja é **fatal**: foi assim que `otplib` e `qrcode` entraram na
v1.1.1 sem existirem no git.

## 5. Decisões e alternativas

**D1: Extrair o runner em vez de duplicá-lo.** `health.mjs` já tem cascata, blindagem de probe e
`worstStatus` testados. Copiar tudo para `release.mjs` criaria duas máquinas que divergem com o
tempo — exatamente o defeito que a SPEC-009 matou quando o doctor e o hook divergiram. Alternativa
rejeitada: `release.mjs` importar de `health.mjs`, deixando o núcleo dono de um runner que não é
dele.

**D2: Instalar, não inspecionar.** O gate faz `npm pack` + `npm i` de verdade. Alternativa
rejeitada: análise estática do tarball — foi o que eu fiz à mão hoje e produziu **falso positivo
imediato** (os geradores contêm `import` dentro de template string). Grep não prova ausência.

**D3: Template literals são removidos antes do parse.** Onde a análise estática for inevitável
(`deps-declared`), o conteúdo entre crases é apagado do fonte antes de casar `import`. Os geradores
*escrevem* código NestJS; não o executam. Sem isso, o check acusa `@nestjs/core` como dependência
não declarada — e é o bug latente que já existe hoje no `runtime-deps` (AC-11).

**D4: Dois modos (`--publish`).** Ver §4. Severidade do `tree-clean` muda com o contexto; o resto
é idêntico.

**D5: A aprovação é perecível.** O `git status` é reconferido **ao final**, porque a auditoria vale
para o disco no instante em que rodou. Um `npm install` entre o check e o publish invalida tudo — e
essa foi literalmente a causa da v1.1.1.

**D6: O gate nunca publica.** Ele autoriza. `npm publish` continua sendo um ato humano deliberado.

**D7: `deps-unused` é `warn`, não `fail`.** Peso morto no tarball incomoda, não quebra. Reprovar um
release por causa disso é o tipo de rigor que ensina o time a usar `--no-verify`.

**D8: `smoke-commands` reprova por padrão no stderr, nunca por exit code.** Numa instalação limpa
não existe workspace nem `universal.db` — então `query:universal` sai com código ≠ 0 *legitimamente*,
e `tools:doctor` avisa sobre memória não indexada. Isso é o pacote **funcionando**. O que denuncia
tarball quebrado é a assinatura do carregamento: `ERR_MODULE_NOT_FOUND`, `ERR_DLOPEN_FAILED`,
`Cannot find module`. Reprovar por exit code faria o gate reprovar um pacote saudável — é a mesma
armadilha do `memory-db` na SPEC-009, um nível acima.

**D9: `prepublishOnly`, nunca `prepack`.** O gate roda `npm pack`. Amarrá-lo ao `prepack` faria o
`npm pack` do gate disparar o `prepack`, que chama o gate, que roda `npm pack`… `npm pack` **não**
dispara `prepublishOnly`, então o hook correto é o único seguro. Vale um comentário no
`package.json`: a alternativa "óbvia" é uma bomba-relógio.

D1 e a mudança de contrato do `prepublishOnly` são estruturais → **ADR-0024**, referenciando
ADR-0023 (mesma filosofia, fronteira seguinte) e ADR-0021 (a classe que ambos fecham).

## 6. Dependências

- **Specs**: SPEC-009 (`lib/core/health.mjs` é a base do runner). Já em `done`.
- **Pacotes npm**: **nenhum novo.** `npm pack`/`npm i` via `child_process`.
- **Migrações**: nenhuma.

## 7. Rollout

- [ ] **Ordem**: `checks.mjs` extraído + suíte verde (refactor puro, nada muda de comportamento) →
      `release.mjs` + testes → `release-check.mjs` → CI → `prepublishOnly` **por último**.
- [x] Doc/persona impactada: `docs/publishing.md`, `CLAUDE.md`, persona **governança**.
- [ ] **Validar reintroduzindo os três bugs históricos** (better-sqlite3 em devDeps; arquivo fora do
      `files[]`; árvore suja). Cada um deve reprovar. Um gate que nunca viu a falha que promete
      pegar não está testado — está escrito.
- [ ] `prepublishOnly` entra **depois** de o gate rodar verde no CI por um ciclo. Ele é a única
      peça que, com falso positivo, impede publicar qualquer coisa.

## 8. Sinais de fracasso (kill criteria)

- **O gate reprova um release saudável.** Um falso positivo no `prepublishOnly` trava a operação
  inteira. Se acontecer uma vez, o `tree-clean` estrito sai do `prepublishOnly` e fica só no CI.
- **`deps-declared` volta a acusar os geradores.** Se o D3 não bastar, o check é rebaixado a `warn`
  e a cobertura passa a vir do `smoke-commands` (que executa e não mente).
- **O gate leva minutos.** O custo real não é o `npm pack` — é o `npm i` compilando o
  `better-sqlite3` do zero (o CI já gasta ~1min45 nisso). Se ficar caro demais, o gate sai do fluxo
  de PR e fica só no release: a instalação limpa é inegociável, a frequência não.
