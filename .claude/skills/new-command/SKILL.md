---
name: new-command
description: Adiciona um comando ao core Forja (registry + alias npm + script + teste), respeitando a invariante do ADR-0020.
disable-model-invocation: true
---

# Novo comando do core

O ADR-0020 estabelece uma invariante: **todo comando de processo passa por
`bin/forja.mjs`**. Não existe script solto. Adicionar um comando é um ato de quatro
partes acopladas — esquecer qualquer uma quebra `test/forja-core.test.js`.

## As quatro partes

| Parte | Onde | Por quê |
|---|---|---|
| Entrada no registry | `lib/core/registry.mjs` | É a fonte da verdade: help, gates e auditoria derivam dela |
| Script alvo | `scripts/<nome>.mjs` | O trabalho de fato |
| Alias npm | `package.json` → `scripts` | Ergonomia; deve delegar ao core, nunca ao script direto |
| Teste | `test/forja-core.test.js` | Já cobre integridade automaticamente — só precisa passar |

## Passos

1. **Escolher o domínio.** Os válidos estão em `DOMAINS` no topo de
   `lib/core/registry.mjs`: `workspace`, `sdd`, `gsd`, `design`, `code`, `memoria`,
   `contexto`, `governanca`, `geracao`. Um domínio novo é mudança estrutural — peça
   um ADR primeiro (skill `new-adr`).

2. **Escrever o script** em `scripts/`. ESM, imports com prefixo `node:`, cabeçalho
   comentando o *porquê* do script. Ele recebe os args depois de `args[]`.

3. **Declarar no registry**, em ordem, dentro do bloco do domínio:

   ```js
   'dominio:acao': {
     domain: 'memoria',
     desc: 'Frase curta no infinitivo, aparece no help',
     node: 'scripts/meu-script.mjs',
     args: ['subcomando'],        // opcional: args fixos antes dos do usuário
     gate: 'workspace',           // opcional: 'workspace' | 'workspace-warn'
   },
   ```

   Use `gate: 'workspace'` se o comando escreve no workspace externo (ADR-0019);
   `workspace-warn` se apenas lê.

4. **Adicionar o alias** em `package.json`. Ele delega ao core, nunca ao script:

   ```json
   "dominio:acao": "node bin/forja.mjs dominio:acao"
   ```

   Chamar `node scripts/meu-script.mjs` direto pula os gates e a auditoria em
   `.context/forja-runs.jsonl` — é exatamente o que o ADR-0020 proíbe.

5. **Verificar.** O hook `PostToolUse` já dispara o teste ao salvar o registry, mas
   confirme o conjunto e o help:

   ```bash
   node --test test/forja-core.test.js
   node bin/forja.mjs                 # o comando deve aparecer sob seu domínio
   node bin/forja.mjs dominio:acao    # execução real
   ```

6. **Permissão.** Se o comando será chamado por agentes, acrescente
   `Bash(npm run dominio:*)` em `.claude/settings.json` → `permissions.allow`,
   senão cada chamada vira um prompt.
