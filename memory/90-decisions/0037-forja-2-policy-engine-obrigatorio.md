# ADR-0037: Policy Engine obrigatório e default deny

- **Status**: accepted
- **Data**: 2026-07-31
- **Autor(es)**: ForjaJS
- **Tags**: security, policy, autonomy, approvals

## Contexto

Capabilities podem ler, escrever, executar comandos, acessar rede ou afetar um deployment. Uma
autonomia sem decisão centralizada permite que cada adapter invente suas próprias permissões.

## Decisão

Toda execução recebe uma porta de Policy Engine. O engine aplica regras determinísticas por
identidade, papel, capability, projeto, ambiente, risco, categoria e escopo de arquivos. Sem
regra correspondente, o resultado é `DENY`. Empates têm precedência `DENY`, `REQUIRE_APPROVAL`,
`ALLOW_WITH_LIMITS`, `ALLOW`. Risco crítico exige aprovação explícita mesmo quando uma regra permite
a ação. Limites retornados pela política devem ser impostos pelo Runtime.

Approval requests são contratos auditáveis; o primeiro ledger é em memória e será substituído por
adapter persistente sem mudar o domínio.

## Rastreamento

- Implementação: `packages/policy/src/index.ts`
- Testes: `test/policy.test.js`, `test/policy-registry.integration.test.js`
- Relacionadas: ADR-0035, ADR-0036
