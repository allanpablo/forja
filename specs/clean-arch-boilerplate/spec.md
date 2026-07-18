# Spec: clean-arch-boilerplate

- **ID**: SPEC-013
- **Status**: approved
- **Owner**: apk
- **Criado em**: 2026-07-18
- **Sprint alvo**: S?
- **ADRs relacionadas**: [ADR-0009](../../memory/90-decisions/0009-claude-hooks-token-economy.md) (economia de tokens), [ADR-0016](../../memory/90-decisions/0016-integracao-capacidades-externas.md) (harness), [ADR-0001](../../memory/90-decisions/0001-memoria-hierarquica.md) (memória hierárquica)

## 1. Problema

Os boilerplates atuais são **NestJS-flat**: `modules/<x>/{controller, service, entities, dto}`, com o
service falando direto com a entity do TypeORM. A infraestrutura (ORM) vaza para dentro da regra de
negócio, não há inversão de dependência, e a regra de domínio — quando existe — fica presa dentro de
um `service` acoplado ao framework. Isso cobra dois preços:

1. **De manutenção**: trocar ORM, testar regra sem subir o Nest, ou mover uma invariante para onde
   ela pertence exige cirurgia.
2. **De tokens** — o que mais importa aqui (ADR-0009). Um agente que opera um projeto flat precisa
   **ler a implementação inteira** para entender o que uma feature faz, porque a regra está diluída
   no service junto do acesso a dados e do HTTP. Não há contrato legível separado da execução.

Ao mesmo tempo, a resposta ingênua — "aplicar Clean Architecture" — tem um preço oposto e igualmente
real: **quatro camadas para um CRUD são mais arquivos para ler, não menos.** Um boilerplate que força
use-case + porta + adapter + mapper por endpoint trivial é o anti-padrão de token que estamos tentando
evitar, com nome bonito.

## 2. Proposta de valor

Um boilerplate Clean Architecture que **sabe quando NÃO ser Clean Architecture.** Camadas ricas onde
há regra de negócio de verdade; caminho enxuto explícito onde é CRUD. Estruturado para **navegação
barata por agente**: o contrato de um use-case se lê pela assinatura de tipo, não pela implementação;
cada bounded context tem um doc de memória na linguagem ubíqua que o agente lê **em vez** do código.
Arquitetura como compressão de contexto, não como cerimônia.

## 3. User stories

- **Como** dev iniciando um produto, **quero** um esqueleto com domínio isolado de framework e ORM,
  **para que** a regra de negócio seja testável e sobreviva a troca de infraestrutura.
- **Como** agente operando o projeto gerado, **quero** ler o contrato tipado de um use-case e o doc
  de contexto do módulo, **para que** eu entenda a feature sem carregar a implementação inteira —
  menos tokens por tarefa.
- **Como** dev com uma feature CRUD trivial, **quero** um caminho enxuto documentado, **para que** eu
  não pague 4 camadas por um `GET /x`.
- **Como** arquiteto, **quero** uma fatia vertical rica de referência (com invariante de negócio de
  verdade), **para que** o padrão Clean Architecture seja demonstrado onde ele se paga, não abstrato.

## 4. Critérios de aceite (Definition of Done)

- [ ] AC-1: Novo boilerplate `boilerplates/06-clean-arch/` com as 4 camadas e a **regra de
      dependência** para dentro: `domain` (puro: entities, value objects, ports/interfaces — zero
      NestJS, zero ORM) → `application` (use-cases orquestrando domínio + portas) → `infrastructure`
      (adapters: repos ORM, mappers, serviços externos) + `presentation` (controllers, DTOs HTTP).
- [ ] AC-2: **Inversão de dependência real** via DI do NestJS: as portas são tokens de injeção
      (`interface` no domínio), os adapters as implementam e são bound no módulo. O use-case depende
      da porta, nunca da implementação.
- [ ] AC-3: **Fatia vertical rica de referência** — um bounded context com invariante de negócio
      genuína (não CRUD) que vive **no domínio** (ex.: um `Order` que não pode ser enviado sem
      pagamento; ou `Subscription` como máquina de estados). Prova que a separação se paga.
- [ ] AC-4: **Caminho enxuto explícito** (a calibração). Um módulo CRUD simples demonstrado com o
      mínimo de camadas, e um doc `WHEN-CLEAN-WHEN-LEAN.md` que ensina o critério de escolha. O
      boilerplate não força ceremônia.
- [ ] AC-5: **Contratos legíveis** — todo use-case tem input/output tipados (TS) que se leem sem a
      implementação. O domínio é a linguagem ubíqua tipada.
- [ ] AC-6: **Memória por bounded context** (ADR-0001): cada contexto tem um doc em
      `memory/30-domains/<ctx>/context.md` na linguagem ubíqua, que o agente lê **antes** do código.
      Medir: o pacote de contexto de uma tarefa cai vs. o boilerplate flat (ADR-0009).
- [ ] AC-7: Manifesto (`boilerplate.manifest.json`) + integração com o gerador (o boilerplate aparece
      como opção, gera com a memória e os agentes multi-IA como os outros).
- [ ] AC-8: **Testes de domínio sem framework**: a invariante da AC-3 tem teste unitário que roda
      **sem subir o Nest** — a prova concreta de que o domínio está isolado.
- [ ] AC-9: O boilerplate passa pelos gates do próprio Forja: `release:check` (está no `files[]`,
      instala limpo) e a coerência de doc (SPEC-011) não acusa comando fantasma nos seus docs.
- [ ] AC-10: ADR registrando a decisão (Clean Architecture calibrada como boilerplate; o *porquê* da
      calibração e do ângulo de token).

## 5. Escopo

**Dentro**:
- `boilerplates/06-clean-arch/` completo: as 4 camadas, a fatia rica, o módulo enxuto, o
  `WHEN-CLEAN-WHEN-LEAN.md`, a memória por contexto, o manifesto.
- Integração com o gerador (`lib/generators/`) para o boilerplate ser selecionável.
- ADR + a atualização de `boilerplates/README.md`.

**Fora** (explícito):
- **Refatorar os boilerplates existentes** (01-05). Eles ficam; este é aditivo. Migrar os antigos é
  outra decisão.
- **Aplicar Clean Architecture ao framework Forja.** Decidido: over-engineering para um CLI; o
  framework ganha só modelos de domínio tipados, e isso ride na migração TS (SPEC-012), não aqui.
- **Frontend.** Este boilerplate é backend (NestJS). Um par frontend é outra spec.
- **Prescrever ORM único.** O ponto é o domínio não saber do ORM; qual ORM o adapter usa é detalhe do
  boilerplate, não da arquitetura.

## 6. NFRs / restrições

- **Token-first (a régua)**: o ganho tem que ser *medível*. AC-6 exige comparar o pacote de contexto
  de uma tarefa-tipo neste boilerplate vs. no flat. Se não cair, a arquitetura virou custo, não
  economia — e aí recalibra.
- **Calibração inegociável**: a existência do caminho enxuto (AC-4) é o que separa esta spec de um
  cargo-cult. Sem ele, reprovado.
- **TypeScript**: alinhado com a migração em curso (SPEC-012) — o domínio é tipado de primeira classe.
- **Compatibilidade**: aditivo; não muda os geradores dos boilerplates existentes.

## 7. Riscos e mitigação

| Risco | Prob | Impacto | Mitigação |
|---|---|---|---|
| Vira cargo-cult: 4 camadas por CRUD, +tokens | **A** | A | AC-4 (caminho enxuto) + AC-6 (medir tokens) são gate; sem eles, reprova |
| Complexidade assusta o dev/agente | M | M | A fatia rica é 1 só; o resto é enxuto. `WHEN-CLEAN-WHEN-LEAN.md` guia |
| Inversão de dependência no Nest fica verbosa | M | M | Padrão de porta-como-token documentado uma vez; repetível |
| O ganho de token não se materializa | M | A | Medir cedo (AC-6). Se não cair, a spec falhou seu propósito — honesto reconhecer |

## 8. Métricas de sucesso

- **Tokens por tarefa** num projeto gerado com este boilerplate **caem** vs. o flat, para uma
  tarefa-tipo ("adicionar uma regra ao contexto X") — medido via `context:smart`/`token:benchmark`.
  É a métrica-norte; sem ela a arquitetura não se justifica.
- Um dev pega a fatia rica e adiciona uma invariante de negócio **sem tocar em infraestrutura**.
- A invariante de domínio é testável **sem subir o Nest** (AC-8).
- 90 dias depois: os projetos novos do usuário escolhem este boilerplate quando há regra de negócio,
  e o flat quando é CRUD puro — a calibração usada na prática, não só documentada.
