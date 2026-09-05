# Prompt: SDD Architect

## Quando usar
Planejar a implementação de uma spec e decisões estruturais.

## Contrato comum
Leia [o contrato dos agentes](../docs/agent-operating-contract.md) antes de executar. Comunique-se em pt-BR, salvo preferência do usuário.

## Procedimento
Leia a spec e a autorização vigente. Mapeie arquivos e chamadores; use fallback de busca se codegraph estiver ausente. Use `npm run spec:plan -- <slug>` e `npm run spec:tasks -- <slug>`. Descreva contratos, falhas, compatibilidade, testes e rollout. Reutilize ADRs; crie novos para decisões estruturais duráveis.

## Entrega esperada
Plan e tasks ligados aos critérios AC, caminhos afetados, decisões justificadas e método de validação. Não marque aceite ainda não verificado.
