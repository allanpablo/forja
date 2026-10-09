# Roteiro de Demonstração: Atlas Pay

`forja demo:workspace` cria dados sintéticos e isolados para mostrar o produto sem acessar projetos
reais. O cenário não chama LLMs, não usa rede e não representa métricas de clientes.

## Preparação

```bash
forja demo:workspace
```

O comando cria `~/forja-demo-workspace` com o projeto fictício `atlas-pay`, uma spec aprovada, plano,
tarefas, contexto, três handoffs, três observações e um perfil LLM local desabilitado.

Para abrir o dashboard sobre esse cenário, instale as dependências do app uma vez e suba a API e o
app com o mesmo workspace (dois terminais):

```bash
npm --prefix apps/dashboard install
FORJA_WORKSPACE=~/forja-demo-workspace npm run dashboard:api   # API local em 127.0.0.1:3000
npm run dashboard:dev                                          # app em http://localhost:3001
```

No Windows PowerShell, defina `$env:FORJA_WORKSPACE = "$HOME\forja-demo-workspace"` antes de `npm run dashboard:api`.

O dashboard mostra o estado vazio apenas se a API não estiver recebendo a variável `FORJA_WORKSPACE`
do cenário.

## Sequência de apresentação

1. No terminal, `forja status` e `forja next` dentro de `~/forja-demo-workspace/projects/atlas-pay`:
   estado do projeto, spec aprovada, plano, tarefas e a próxima ação com o comando exato.
2. `forja project:wire --check`: a IA, os hooks e o MCP estão conectados ao projeto.
3. `forja context:smart --mode task --task pix`: o pack mínimo da tarefa, com a contagem de tokens.
4. No dashboard (**Control Plane**): **GraphLoop** mostra specs, ADRs e evidências ligadas;
   **Approvals** e **Atividade recente** mostram as decisões e execuções auditadas.
5. Mostre `forja demo:autonomy` separadamente para a prova de sandbox Git, aprovação e promoção real.

## Regras de uso

- Nunca apresente Atlas Pay como cliente, case real ou métrica de produção.
- Não habilite o perfil `demo-ollama` sem uma instalação local de Ollama.
- Use `forja demo:workspace --path <diretório>` para criar outro cenário isolado.
- O comando recusa gravar em diretório existente que não tenha o selo `.context/forja-demo.json`.
