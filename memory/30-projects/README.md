# memory/30-projects — fichas de projetos (privadas)

Este diretório registra os projetos rastreados pela Memória Universal. Cada projeto
gera uma ficha `<nome>.md` (criada por `init-project.js` ou pela sincronização de
memória).

## Privacidade

As fichas de projeto carregam dados de produto/cliente e por isso **não são
versionadas** — `.gitignore` ignora `memory/30-projects/*` exceto este README.
A mesma convenção vale para `specs/<produto>/` e `.context/` (ver `.gitignore`).

As fichas continuam existindo em disco e funcionando localmente; apenas não entram
no repositório público do framework. Para regenerar a ficha de um projeto, rode o
fluxo de init/sync de memória correspondente.
