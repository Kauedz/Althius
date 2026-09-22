# Althius

Althius é um Revenue OS: uma plataforma em que empresas B2B operam o seu go-to-market com a ajuda de agentes especialistas. O primeiro módulo é a aba de Agentes.

## Plataforma

**Revenue OS**:
A plataforma Althius como um todo, composta de módulos; a aba de Agentes é o primeiro.
_Avoid_: CRM, ferramenta de vendas

**Workspace**:
O espaço de uma empresa-cliente dentro da Althius, com seus agentes, conexões e dados.
_Avoid_: conta, tenant, organização

**Cliente**:
A empresa que contrata a Althius e é dona de um Workspace.
_Avoid_: usuário, conta

**Conta-alvo**:
Uma empresa que o Cliente quer vender para; é o objeto que os agentes analisam.
_Avoid_: lead, prospect, conta

**Comitê de compra**:
O conjunto de pessoas de uma Conta-alvo que influenciam ou decidem a compra.
_Avoid_: buying committee, stakeholders, decisores

## Agentes

**Agente**:
Um especialista fixo, criado pela Althius. O Cliente não cria Agentes, apenas os personaliza.
_Avoid_: bot, assistente, "agente de X"

**Scopus**:
O Agente de ICP: define o perfil de cliente ideal e dá nota de fit às Contas-alvo.

**Ethos**:
O Agente de Persona: descreve dores, objeções e gatilhos de cada papel do Comitê de compra.

**Rhetor**:
O Agente de escrita persuasiva: produz e-mails, sequências, posts e copy no tom da marca e por persona.

**Oraculum**:
O Agente de GEO (Generative Engine Optimization): mede e melhora como a marca aparece e é citada em respostas de LLMs.
_Avoid_: agente de SEO, agente geográfico

**Personalização**:
Os ajustes que o Cliente faz num Agente: instruções, tom de voz, base de conhecimento, ferramentas e canais. Não inclui renomear o Agente.
_Avoid_: customização, criar agente

**Memória**:
Os fatos que um Agente aprendeu sobre o Cliente e seus usuários, cada um com origem e editável.

**Habilidade**:
Um procedimento que o Agente criou ou refinou com o uso e passa a reaplicar.
_Avoid_: skill, prompt, template

**Conversa**:
Uma troca direta entre um usuário e um Agente dentro da Althius.
_Avoid_: chat

**Rotina**:
Uma tarefa agendada que o Agente executa sozinho de forma recorrente.
_Avoid_: automação, cron

**Atividade**:
O histórico de tudo que um Agente fez, com o gatilho (Conversa, Menção, Rotina ou Canal) e o resultado.
_Avoid_: log

**Menção**:
Chamar um Agente com @ no meio de uma conversa ou pela barra de comando, no estilo Grok.

**Colaboração**:
Quando um Agente repassa trabalho a outro (ex.: Scopus → Ethos → Rhetor).
_Avoid_: orquestração, pipeline

## Conexões e permissões

**Conexão**:
Uma ferramenta externa ligada ao Workspace, conectada uma vez e usada pelos Agentes autorizados. É um Canal ou uma Integração.

**Canal**:
Uma Conexão onde se conversa com um Agente (ex.: Slack, WhatsApp, Teams, E-mail).
_Avoid_: integração

**Integração**:
Uma Conexão de onde o Agente lê ou para onde escreve dados (ex.: HubSpot, Clay, Apollo, Lusha, Notion, Meta Ads, Google Ads).
_Avoid_: canal, conector

**Permissão**:
O nível de ação de um Agente sobre uma Integração: **Ler**, **Propor** (exige Aprovação) ou **Executar** (age sozinho).

**Aprovação**:
Uma ação proposta por um Agente que só acontece depois que um humano a aceita, na fila de Aprovações ou no Canal de origem.
_Avoid_: revisão, confirmação
