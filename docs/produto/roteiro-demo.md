# Roteiro de Demonstração: Atlas Pay

`forja demo:workspace` cria dados sintéticos e isolados para mostrar o produto sem acessar projetos
reais. O cenário não chama LLMs, não usa rede e não representa métricas de clientes.

## Preparação

```bash
forja demo:workspace
```

O comando cria `~/forja-demo-workspace` com o projeto fictício `atlas-pay`, uma spec aprovada, plano,
tarefas, contexto, três handoffs, três observações e um perfil LLM local desabilitado.

Para abrir o dashboard sobre esse cenário, inicie os dois processos com o mesmo workspace:

```bash
FORJA_WORKSPACE=~/forja-demo-workspace npm --prefix dashboard start
FORJA_WORKSPACE=~/forja-demo-workspace npm --prefix dashboard/web run dev
```

No Windows PowerShell:

```powershell
$env:FORJA_WORKSPACE = "$HOME\forja-demo-workspace"
npm --prefix dashboard start
```

Abra `http://127.0.0.1:5173`. O dashboard mostra o estado vazio apenas se não estiver recebendo a
variável `FORJA_WORKSPACE` do cenário.

## Sequência de apresentação

1. Abra **Sistema**: mostra o projeto Atlas Pay, gates e a contagem de handoffs.
2. Abra **Specs**: apresente problema, critérios de aceite, plano e tarefas aprovados.
3. Abra **Handoffs**: há dois handoffs concluídos e um em review, todos marcados como demonstração.
4. Abra **Memória** e **Tokens**: explique que contexto e observações são dados locais e consultáveis.
5. Abra **Agentes** para mostrar o perfil `demo-ollama`: ele fica desabilitado até existir uma CLI
   Ollama local, reforçando que o Forja não inventa disponibilidade de modelo.
6. Mostre `forja demo:autonomy` separadamente para a prova de sandbox Git, aprovação e promoção real.

## Regras de uso

- Nunca apresente Atlas Pay como cliente, case real ou métrica de produção.
- Não habilite o perfil `demo-ollama` sem uma instalação local de Ollama.
- Use `forja demo:workspace --path <diretório>` para criar outro cenário isolado.
- O comando recusa gravar em diretório existente que não tenha o selo `.context/forja-demo.json`.
