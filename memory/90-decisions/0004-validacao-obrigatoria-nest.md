# ADR-0004: Validação e segurança obrigatórias no scaffold NestJS

- **Status**: accepted
- **Data**: 2026-04-21
- **Tags**: security, scaffold

## Contexto
Versão inicial do scaffold gerava controllers sem DTO, sem rate-limit, sem sanitização. Projetos derivados herdaram débito de segurança. Custo de "consertar depois" é alto.

## Decisão
Todo controller gerado pelo kit deve:
- Usar DTOs com `class-validator` (`@IsString`, `@IsEmail`, `@MaxLength`, etc.)
- Tratar erro via `HttpException` com código específico
- Ter `*.spec.ts` gerado lado-a-lado
- Aplicar `helmet`, `rate-limit` global e payload máximo de 10MB

## Alternativas consideradas
- **Validação opcional** — rejeitada: vira "todo mundo pula"
- **Validação só em endpoints públicos** — rejeitada: classificar "público" é ambíguo

## Consequências
**Positivas**: baseline de segurança herdado por todos os projetos derivados.
**Negativas**: scaffold mais verboso (~30% mais arquivos no `--no-only-memory`).

## Rastreamento
- `lib/generators/nest-generator.js`
- `docs/archive/REFINAMENTO-v1.0.md` (seção SEC-001..004)
