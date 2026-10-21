---
name: dependency-upgrade
description: Use quando atualizar dependências de um projeto (pacotes npm, runtime, frameworks): inventaria o que está desatualizado e vulnerável, separa atualizações compatíveis das incompatíveis, lê os changelogs, aplica um major por vez com os testes como gate, resolve conflitos de peer sem forçar, e registra o que ficou para trás e por quê.
---

# Atualização de Dependências

Atualizar dependências é trocar código que você não escreveu por outro código que você não escreveu. Feito de uma vez, um erro no meio de vinte atualizações não tem culpado. Feito um major por vez, com os testes rodando entre cada um, toda quebra tem endereço.

A saída padrão é um **plano de atualização**. Instale e altere arquivos só quando o usuário pedir.

## Convenções

- Entradas: `package.json`, o lockfile, `engines`, o CI e a suíte de testes (`testing`).
- O gerenciador de pacotes do projeto (npm, pnpm, yarn) e o lockfile dele. Nunca misture gerenciadores.
- Toda atualização incompatível tem o changelog ou o guia de migração lido antes, não depois de quebrar.

## Inventarie

1. `npm outdated` (ou `pnpm outdated`): atual, desejada (dentro do intervalo) e mais recente.
2. `npm audit` (ou `osv-scanner`): vulnerabilidades, com severidade e se há correção.
3. Para cada major disponível: o changelog ou guia de migração, e as dependências que exigem uma versão específica (peer dependencies).
4. O runtime: a versão de Node em `engines`, no CI e nos ambientes; as versões que o framework exige.

## Classifique

| Tipo | Exemplo | Como tratar |
|---|---|---|
| Patch/minor dentro do intervalo | `5.90.5 → 5.104.1` | Em lote, com a suíte completa |
| Correção de segurança | `npm audit fix` | Prioridade; sem `--force` |
| Major isolado | `typescript 6 → 7` | Um por vez: ler o guia, atualizar, corrigir, testar, commitar |
| Major em cadeia | framework que exige outro major (`@nestjs/* 11 → 12` junto com `rxjs`, `typeorm`) | Juntos, na ordem que o guia indicar, num commit |
| Mudança de paradigma | pacote que virou ESM-only, troca de executor de testes | Tratar como migração planejada, com spike se necessário (`technical-spike`) |

## Aplique

1. **Linha de base verde**: rode build, testes e lint antes de mexer. Uma suíte vermelha antes da atualização esconde o que a atualização quebrou.
2. **Compatíveis em lote**: atualize os patches e minors, rode a suíte, commit.
3. **Majors um a um**, cada um com o próprio commit: leia o guia, atualize, corrija o que o compilador e os testes apontarem, rode a suíte completa (inclusive os testes de integração e o build de produção).
4. **Conflitos de peer**: entenda quem exige o quê (`npm ls <pacote>`, `npm explain <pacote>`). Prefira esperar a versão compatível, ou declarar um `overrides` explícito e comentado, a usar `--force` ou `--legacy-peer-deps`, que escondem o conflito.
5. **Ferramentas que não acompanharam**: quando um ecossistema ainda não suporta o major novo (por exemplo, um executor de testes que exige o compilador anterior), fique na última versão suportada e registre o motivo e o gatilho para revisitar.
6. **Scripts de instalação**: verifique se pacotes nativos ainda instalam onde scripts de instalação estão bloqueados (npm 11+), e se trazem binários prontos.
7. **Teste o que o usuário roda**: além da suíte, o build de produção, a aplicação subindo e o fluxo principal funcionando. Para bibliotecas, instale o pacote empacotado num projeto limpo.

## Formato

```
## Inventário
| Pacote | Atual | Alvo | Tipo | Notas (changelog, peer, segurança) |

## Plano
| # | Passo | Pacotes | Verificação | Commit |

## Ficou para trás
| Pacote | Versão mantida | Motivo | Gatilho para revisitar |
```

## Próximo

- `testing`: a suíte completa é o gate de cada passo.
- `commit-message`: um commit `build(deps)` por passo; `!` quando a atualização muda o contrato do projeto.
- `release-notes`: atualizações que os usuários percebem (runtime mínimo, comportamento) entram nas notas.

## No Forja

No Forja, depois de cada passo rode também `forja tools:doctor` e `forja project:wire --check` (atualizações podem mudar o runtime que os hooks e o MCP usam). Uma mudança de paradigma (pacote que virou ESM-only, troca do executor de testes) vira ADR em `memory/90-decisions/`, e o que ficou para trás entra na seção "Evidências e estado real" da spec da atualização.

## Evite

- Atualizar tudo de uma vez e depurar o resultado.
- `npm audit fix --force` ou `--legacy-peer-deps` para calar um conflito.
- Atualizar major sem ler o guia de migração.
- Partir de uma suíte que já estava vermelha.
- Considerar pronto porque o `npm install` terminou sem erro.
- Deixar uma dependência para trás sem registrar o motivo.
