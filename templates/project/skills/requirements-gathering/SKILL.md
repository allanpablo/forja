---
name: requirements-gathering
description: Use quando transformar ideias, achados de elicitação ou documentos numa especificação de requisitos estruturada: escopo, atores, requisitos funcionais com critérios de aceite, regras de negócio, requisitos não funcionais mensuráveis, glossário e prioridades.
---

# Levantamento de Requisitos

Consolida o que se sabe sobre um sistema numa especificação de requisitos curta e verificável. Entrada: uma ideia, achados de elicitação (skill `requirements-elicitation`), documentos existentes ou um sistema legado. Saída: a especificação que `domain-modeling` consome.

A especificação é uma lista de trabalho, não literatura. Detalhe só o que é incerto e está perto de ser construído; o longo prazo fica como direção.

A especificação está pronta quando um desenvolvedor consegue implementá-la sem adivinhar e um testador consegue verificá-la sem interpretar.

## Convenções

- Termos em pt-BR seguidos do en-US: Requisito Funcional (Functional Requirement), Regra de Negócio (Business Rule), Requisito Não Funcional (Non-Functional Requirement), Critério de Aceite (Acceptance Criterion), Ator (Actor), Parte Interessada (Stakeholder), Escopo (Scope), Linguagem Ubíqua (Ubiquitous Language).
- IDs: `RF-NN` (funcional), `RN-NN` (regra de negócio), `RNF-NN` (não funcional). Nunca reutilize um ID; marque itens removidos como removidos.
- Escreva no vocabulário das partes interessadas.

## Princípio central

Um requisito descreve **o quê** e **por quê**, nunca **como**. "A enfermeira precisa ver a dieta do paciente antes de fazer o pedido" é um requisito; "mostrar um selo de dieta na tela de pedido" é uma solução. Se a entrada trouxer uma solução, registre o problema por trás dela e mantenha a solução como nota.

Especifique exatamente o necessário: nem acima (soluções, decisões de design) nem abaixo (lacunas que quem implementa terá de preencher adivinhando).

## Qualidade de cada item

Todo requisito e regra precisa ser:
- **Atômico**: uma necessidade por item.
- **Verificável**: checável por um teste, uma métrica ou um comportamento observável; tem critérios de aceite ou um exemplo. Se não dá para checar, é um desejo, não um requisito: reescreva ou descarte.
- **Com fonte**: quem disse ou de onde veio.
- **Sem ambiguidade**: ambiguidade é defeito. Se dá para ler de duas formas, reescreva até sobrar uma leitura só. Nada de "rápido", "fácil", "flexível", "amigável", "etc.", "e/ou" sem definição.
- **Completo**: cobre os casos de borda, não só o caminho feliz.

Itens que falham nessas verificações vão para **Perguntas em aberto**, não para a lista.

## Processo

### 1. Objetivo e contexto
Um parágrafo: que problema é resolvido, para quem, e como o sucesso é reconhecido. Sem isso, nada pode ser priorizado.

### 2. Atores e partes interessadas
Quem interage com o sistema (atores) e quem é afetado por ele (partes interessadas). Inclua sistemas externos como atores.

### 3. Escopo
Escopo é um contrato. Listas explícitas de **dentro** e **fora**. O "fora" impede o crescimento silencioso do escopo e é tão importante quanto o "dentro".

### 4. Requisitos funcionais
Frases curtas: `<Ator> precisa conseguir <ação> para <objetivo>`. Para cada um, 1–4 critérios de aceite em Dado/Quando/Então ou exemplos concretos. Os critérios cobrem modos de falha, entradas inválidas ou inesperadas e limites, não só o caminho feliz; um requisito só com critérios de caminho feliz está incompleto.

### 5. Regras de negócio
Separadas dos requisitos funcionais: as regras que governam o domínio independentemente das telas (limites, elegibilidade, cálculos, prazos, estados, quem pode fazer o quê). Enuncie cada regra com um exemplo. Regras que variam ou podem mudar são marcadas como **variáveis**: virarão Políticas em `domain-modeling`.

### 6. Requisitos não funcionais
Só os mensuráveis, e só os que importam aqui: desempenho (latência num volume declarado), disponibilidade, segurança, auditabilidade, retenção de dados, compliance (dados pessoais → sinalize para `lgpd-compliance`), integrações, acessibilidade. Um requisito não funcional sem número ou condição verificável vai para perguntas em aberto.

### 7. Glossário
Termos do domínio com seu significado e o contexto em que se aplicam. É a semente da linguagem ubíqua. Quando um termo tem dois significados, registre os dois: isso sinaliza dois contextos delimitados.

### 8. Prioridade
MoSCoW por requisito funcional: **Must** (sem ele o sistema não tem razão de existir), **Should**, **Could**, **Won't (agora)**. Poucos Musts. Se tudo é Must, pergunte o que seria cortado se o prazo caísse pela metade.

### 9. Suposições e perguntas em aberto
O que foi suposto sem confirmação e o que ainda precisa ser perguntado, e a quem. Incógnitas são listadas, nunca preenchidas com palpites. Quando faltar informação-chave, uma lista precisa e direcionada de perguntas é o entregável; prefira-a a uma especificação construída sobre suposições.

### 10. Encaminhamento
Anote o que vai para onde: regras de negócio e glossário → `domain-modeling`; critérios de aceite → `testing` (mais a skill da linguagem, por exemplo `ts-testing`); dados pessoais → `lgpd-compliance`; incertezas técnicas → `technical-spike`.

## Formato de saída

```
# Requisitos: <sistema ou funcionalidade>

## Objetivo
<problema, para quem, critério de sucesso>

## Atores
| Ator | Descrição |

## Escopo
- Dentro: ...
- Fora: ...

## Requisitos funcionais
### RF-01 — <título curto> [Must]
<Ator> precisa conseguir <ação> para <objetivo>.
Fonte: <...>
Critérios de aceite:
- Dado ... Quando ... Então ...

## Regras de negócio
| ID | Regra | Exemplo | Variável? | Fonte |

## Requisitos não funcionais
| ID | Requisito | Medida / condição | Fonte |

## Glossário
| Termo | Significado | Contexto |

## Suposições e perguntas em aberto
- <item> — perguntar a <quem>

## Encaminhamento
- domain-modeling: RN-..., glossário
- testing: critérios de aceite de RF-...
- lgpd-compliance: <dados pessoais envolvidos>
- technical-spike: <incertezas>
```

## No Forja

No Forja, a especificação vive em `specs/<slug>/spec.md`, criada com `forja spec:new <slug>`. Mapeie as seções:

| Esta skill | spec.md do Forja |
|---|---|
| Objetivo | §1 Problema e §2 Proposta de valor |
| Requisitos funcionais (`RF-NN`) | §3 User stories |
| Critérios de aceite | §4 Critérios de aceite, como `AC-n` (cite o `RF-NN` de origem) |
| Escopo | §5 Escopo (Dentro / Fora) |
| Requisitos não funcionais | §6 NFRs / restrições |
| Riscos e suposições | §7 Riscos e mitigação |

Regras de negócio e glossário também vão para `memory/30-domains/<contexto>/`. Ao terminar a revisão: `forja spec:set-status <slug> spec approved`; depois `forja spec:check <slug>`.

## Evite

- Soluções escritas como requisitos (telas, tabelas, tecnologias).
- Documentos de casos de uso com dezenas de páginas.
- Detalhar o futuro distante.
- Requisitos não funcionais vagos ("o sistema precisa ser rápido").
- Manter desejos (afirmações não testáveis) como requisitos.
- Critérios de aceite só de caminho feliz.
- Regras de negócio escondidas dentro de requisitos funcionais.
- Preencher lacunas com regras inventadas.
