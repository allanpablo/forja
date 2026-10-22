# Spec: criterios-ligados-a-testes

- **ID**: SPEC-053
- **Status**: done
- **Owner**: apk
- **Criado em**: 2026-10-21
- **Sprint alvo**: 5.2
- **ADRs relacionadas**: [ADR-0007](../../memory/90-decisions/0007-sdd-pipeline.md) (SDD), ADR-0092 (esta feature)

## 1. Problema
Uma spec diz o que é "pronto" nos critérios de aceite (`AC-N`), mas nada liga um critério ao teste
que o prova. Uma spec vira `done` com critérios sem teste, e um critério renumerado deixa testes
apontando para o critério errado, sem ninguém notar. A convenção existe por costume (`SPEC-029 AC-5`
no nome do teste), mas ninguém a confere. Medição hoje: não sabemos quantos ACs têm teste.

## 2. Proposta de valor
`forja spec:trace` mostra, para cada critério de cada spec, os testes que o citam, e aponta os
critérios sem teste e as citações órfãs. Com `--strict`, vira gate para specs aprovadas ou prontas.

## 3. User stories
- **Como** governance, **quero** ver quais critérios de uma spec `done` não têm teste, **para que** "pronto" signifique provado.
- **Como** dev, **quero** saber que citar `SPEC-053 AC-2` no nome do teste basta, **para que** a ligação não custe nada.
- **Como** dev que editou a spec, **quero** ser avisado de testes citando um critério que não existe mais, **para que** a rastreabilidade não minta.

## 4. Critérios de aceite (Definition of Done)
- [ ] AC-1: `forja spec:trace [slug]` lista cada `AC-N` da spec e os testes que o citam (arquivo:linha), e resume `N/M critérios com teste`.
- [ ] AC-2: um teste cita um critério escrevendo `SPEC-NNN AC-N`, `<slug> AC-N` ou listas (`SPEC-029 AC-5/AC-6`, `AC-1, AC-2`); `AC-N` sozinho vale para a spec quando o arquivo de teste cita uma única spec (pelo ID, pelo slug, por `specs/<slug>/` ou pelo nome do arquivo, `<slug>.test.js`) e o critério existe nela; senão, é listado como ambíguo.
- [ ] AC-3: citação qualificada de critério inexistente (`SPEC-053 AC-9` sem AC-9) aparece como órfã.
- [ ] AC-4: arquivos de teste são achados em qualquer stack (`*.test.*`, `*.spec.*`, `test_*.py`, `*_test.go`, pastas `test/`, `tests/`, `__tests__/`), ignorando `node_modules`, `dist`, `.git` e `coverage`.
- [ ] AC-5: `--strict` sai com 2 (`rejected`) quando uma spec `approved`, `implementing` ou `done` tem critério sem teste ou citação órfã; sem `--strict` o comando só informa (exit 0). `--json` segue o contrato (ADR-0082).
- [ ] AC-6: o `AGENTS.md` do projeto gerado e a skill `testing` ensinam a convenção.

## 5. Requisitos não-funcionais
- **Performance**: repo do Forja (~90 arquivos de teste, ~50 specs) em < 2 s.
- **Segurança**: somente leitura.

## 6. Fora de escopo
- Rodar os testes e marcar o critério como verde/vermelho (fica para o executor de testes de cada stack).
- Editar specs ou testes automaticamente.

## 7. Riscos e dependências
- `AC-N` sozinho num arquivo que cita várias specs é ambíguo: não conta para nenhuma (o relatório diz por quê).
