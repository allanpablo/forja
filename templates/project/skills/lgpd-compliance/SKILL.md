---
name: lgpd-compliance
description: Use quando desenhar ou revisar um sistema, funcionalidade ou modelo de dados que trata dados pessoais sob a LGPD: classifica os dados, atribui bases legais, retenção e direitos dos titulares, e deriva os controles técnicos.
---

# Conformidade com a LGPD

Aplica a LGPD (Lei nº 13.709/2018) a um sistema, funcionalidade ou modelo de domínio, pelo lado da engenharia: que dados existem, por que são tratados, com qual base legal, por quanto tempo, quem pode acessá-los e quais controles técnicos decorrem disso.

Isto é **conformidade desde a concepção** (privacy by design), não aconselhamento jurídico. Toda saída termina com os pontos que precisam ser validados pelo Encarregado ou pelo jurídico.

## Convenções

- Termos jurídicos em pt-BR seguidos do en-US: Titular (Data Subject), Controlador (Controller), Operador (Processor), Encarregado (DPO), Tratamento (Processing), Base Legal (Legal Basis), Dado Pessoal Sensível (Sensitive Personal Data), Anonimização (Anonymization), Pseudonimização (Pseudonymization), RIPD (Data Protection Impact Assessment), ANPD (National Data Protection Authority).
- Cite os artigos da LGPD ao enunciar uma obrigação, para que possa ser verificada.
- Não invente bases legais nem prazos de retenção. Itens desconhecidos vão para **Perguntas em aberto**.
- As regulamentações da ANPD mudam. Quando um prazo ou procedimento depender de regulamento da ANPD, sinalize-o para verificação contra o texto vigente.

## Princípio central

A conformidade começa pela **finalidade**. Todo dado pessoal precisa responder: para quê, com qual base, por quanto tempo. Um dado que não consegue responder é um dado que não deveria ser coletado (princípio da necessidade, Art. 6º, III).

## Processo

### 1. Inventariar os dados
Liste cada dado pessoal que o sistema coleta, deriva ou recebe de outros sistemas. Inclua os não óbvios: endereços IP, IDs de dispositivo, logs, geolocalização, campos de texto livre, uploads de arquivos, dados dentro de eventos e filas, backups.

### 2. Classificar cada dado
| Classe | Definição | Artigo |
|---|---|---|
| Dado pessoal | Identifica ou pode identificar uma pessoa natural. | Art. 5º, I |
| Dado pessoal sensível | Origem racial ou étnica, convicção religiosa, opinião política, filiação a sindicato ou a organização de caráter religioso, filosófico ou político, dado referente à saúde ou à vida sexual, dado genético ou biométrico. | Art. 5º, II |
| Dados de crianças e adolescentes | Exigem tratamento no seu melhor interesse; dados de crianças seguem regras específicas. | Art. 14 |
| Dado anonimizado | Não pode ser reidentificado por meios razoáveis. Fora do escopo enquanto permanecer anônimo. | Art. 5º, III; Art. 12 |
| Dado pseudonimizado | Continua sendo dado pessoal: a reidentificação é possível com a chave mantida separada. | Art. 13, §4º |

### 3. Ligar o tratamento à finalidade e à base legal
Para cada finalidade (não para cada campo), declare a finalidade em uma frase, os dados usados e a base legal.

- **Dados pessoais** (Art. 7º): consentimento; cumprimento de obrigação legal ou regulatória; administração pública; estudos por órgão de pesquisa; execução de contrato; exercício regular de direitos; proteção da vida; tutela da saúde por profissionais ou serviços de saúde; interesse legítimo; proteção do crédito.
- **Dados sensíveis** (Art. 11): lista mais restrita. Interesse legítimo, execução de contrato e proteção do crédito **não** estão disponíveis. Tutela da saúde, obrigação legal ou regulatória, proteção da vida, exercício regular de direitos e prevenção à fraude e à segurança do titular são os candidatos habituais.
- O **consentimento** precisa ser livre, informado, inequívoco e para uma finalidade determinada, e pode ser revogado (Art. 8º). Prefira outra base quando uma de fato se aplicar; um sistema construído sobre consentimento precisa suportar a revogação.
- O **interesse legítimo** exige um teste de balanceamento e só os dados estritamente necessários (Art. 10).

### 4. Definir a retenção e o término do tratamento
Para cada finalidade: por quanto tempo o dado é mantido, o que dispara o término (Art. 15) e o que acontece depois: exclusão, anonimização ou conservação sob uma exceção do Art. 16 (por exemplo, obrigação legal). Um prazo legal de retenção precisa ser nomeado, não suposto.

### 5. Atender aos direitos dos titulares (Art. 18)
Para cada direito, declare como o sistema o atende ou por que não se aplica:
confirmação da existência de tratamento; acesso; correção; anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos; portabilidade; eliminação dos dados tratados com consentimento; informação sobre compartilhamento; informação sobre a possibilidade de não consentir; revogação do consentimento. E também a revisão de decisões automatizadas (Art. 20), quando o sistema as toma.

Consequência para a engenharia: os dados pessoais precisam ser localizáveis por titular em tabelas, arquivos, eventos e backups. Se não podem ser encontrados, não podem ser devolvidos nem excluídos.

### 6. Mapear compartilhamentos e transferências
Liste cada destinatário: operadores (nuvem, e-mail, analytics, provedores de IA), outros controladores, órgãos públicos. Para transferências para fora do Brasil, identifique o mecanismo do Art. 33. Os operadores agem segundo as instruções do controlador (Art. 39).

### 7. Derivar os controles técnicos (Art. 46)
Escolha de forma proporcional ao risco:
- **Minimização**: não colete o que não tem finalidade; evite campos de texto livre que atraem dados sensíveis.
- **Segregação**: dados sensíveis em tabelas ou schema próprios, com acesso restrito.
- **Criptografia**: em trânsito, sempre; em repouso para dados sensíveis (no nível da coluna ou da aplicação quando o nível do banco não for suficiente).
- **Pseudonimização**: para analytics, BI e réplicas que não precisam da identidade.
- **Controle de acesso**: privilégio mínimo, por papel e por finalidade; segurança por linha (row-level security) onde uma tabela atende vários contextos.
- **Trilha de auditoria**: registro somente de acréscimo de quem acessou ou alterou dados pessoais, quando e por quê. Na prática, exigido para responder a direitos e incidentes.
- **Logs e observabilidade**: nada de dados pessoais em logs, traces, labels de métricas ou mensagens de erro. Mascare por padrão.
- **Exclusão de verdade**: soft delete não é exclusão. Defina como a exclusão ou a anonimização chega a réplicas, caches, índices de busca, filas e backups.
- **Ambientes fora de produção**: nada de dados pessoais reais em desenvolvimento ou teste sem anonimização.

### 8. Avaliar a necessidade de um relatório de impacto
Recomende um RIPD (Art. 38) quando o tratamento envolver dados sensíveis em escala, tratamento em larga escala, monitoramento sistemático, tecnologias novas, decisões automatizadas com efeito significativo, ou interesse legítimo como base para um tratamento de alto risco.

### 9. Preparar-se para incidentes
Declare como um incidente de segurança seria detectado e dimensionado (quais titulares, quais dados). A comunicação à ANPD e aos titulares é obrigatória quando o incidente puder acarretar risco ou dano relevante (Art. 48); verifique o prazo no regulamento vigente da ANPD.

## Formato de saída

```
## Inventário de dados
| Dado | Classe | Origem | Onde é armazenado | Finalidades |

## Mapa de tratamento
| Finalidade | Dados | Base legal (artigo) | Retenção / gatilho de término | Destinatários |

## Direitos dos titulares
| Direito | Como é atendido | Lacunas |

## Controles técnicos
- <controle> — aplica-se a <dado/fluxo> — motivo

## Relatório de impacto
<necessário / não necessário, e por quê>

## Perguntas em aberto
- <base legal, prazo de retenção, contratos, transferências a validar com o Encarregado/jurídico>
```

## No Forja

No Forja, decisões de base legal, retenção e transferência viram ADR em `memory/90-decisions/`, e os requisitos derivados entram em §6 da spec (`specs/<slug>/spec.md`).

## Evite

- Tratar o consentimento como base padrão para tudo.
- Supor que dados pseudonimizados estão fora da LGPD.
- Guardar dados "por via das dúvidas", sem finalidade nem prazo.
- Dados pessoais em logs, URLs, eventos de analytics ou fixtures de teste.
- Soft delete apresentado como exclusão.
- Apresentar conclusões como aconselhamento jurídico.
