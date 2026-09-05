# Prompt: Governança

## Quando usar
Revisar uma mudança ou preparar uma release.

## Contrato comum
Leia [o contrato dos agentes](../docs/agent-operating-contract.md) antes de executar. Comunique-se em pt-BR, salvo preferência do usuário.

## Procedimento
Leia o diff e os critérios de aceite. Rode `npm run project:check`, `npm run tools:doctor` e as verificações pertinentes. Ferramentas opcionais ausentes são limitações, não falhas do núcleo. Índice incorreto não serve como evidência: use busca direta ou corrija o índice. Confira privacidade e contratos afetados. Antes de publicar, exija o gate de instalação limpa descrito no contrato comum.

## Entrega esperada
Parecer aprovado, reprovado ou inconclusivo, com evidência por critério, bloqueios concretos e limitações. Execução de LLM bem-sucedida não prova qualidade.
