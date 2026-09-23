# Althius

Althius é um Revenue OS: uma plataforma em que empresas B2B operam o seu go-to-market com a ajuda de agentes especialistas. Os módulos são a aba de Agentes e Contas e Contatos.

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
Uma empresa que o Cliente quer vender para: recomendada pela Althius, sempre com Fit, ou importada pelo Cliente, com qualquer Aderência. É o objeto que os agentes analisam. "Contas" é aceito só como rótulo curto no menu e na aba.
_Avoid_: lead, prospect, conta

**Aderência**:
A classificação de uma Conta-alvo pelo Scopus: **Quente** (tem Fit e deve ser abordada agora), **Fit** (encaixa no ICP) ou **Não fit**. Quente implica Fit. Uma Conta-alvo importada fica sem Aderência até ser avaliada.
_Avoid_: momento, temperatura, fit score, nota, score, morna, frio

**Contato**:
Uma pessoa de uma Conta-alvo registrada no Workspace, venha do CRM, de enriquecimento ou de um Agente. Pode ou não fazer parte do Comitê de compra.
_Avoid_: lead, pessoa, prospect

**Persona**:
A classificação de um Contato por um papel do Comitê de compra descrito pelo Ethos. Um Contato tem no máximo uma Persona, e pode não ter nenhuma.
_Avoid_: perfil, papel, arquétipo

**Sinal**:
Um acontecimento detectado numa Conta-alvo (ex.: "Abriu 3 vagas comerciais"), com data e, quando houver, fonte e evidência. Um Sinal nunca é uma Interação.
_Avoid_: evento, alerta, gatilho

**Interação**:
Um contato comercial registrado entre alguém do Cliente e um Contato: e-mail enviado ou recebido, mensagem enviada, ligação ou reunião. Uma sequência só criada, sem envio, não é Interação. O "Último contato" de uma Conta-alvo é a Interação mais recente com qualquer Contato dela.
_Avoid_: toque, atividade, engajamento

**Comitê de compra**:
O conjunto de pessoas de uma Conta-alvo que influenciam ou decidem a compra.
_Avoid_: buying committee, stakeholders, decisores

## Agentes

**Especialidade**:
Um dos quatro tipos fixos de trabalho do catálogo da Althius (Scopus, Ethos, Rhetor, Oraculum). O Cliente não cria Especialidades.
_Avoid_: template, modelo, tipo de agente

**Agente**:
Um trabalhador de uma Especialidade dentro de um Workspace. É um Agente padrão ou um Agente criado.
_Avoid_: bot, assistente, "agente de X"

**Agente padrão**:
O Agente que todo Workspace tem para cada Especialidade, com o nome dela (ex.: "Scopus"). Não pode ser excluído.

**Agente criado**:
Um Agente que o Cliente cria a partir de uma Especialidade, nomeado "Especialidade · complemento" (ex.: "Scopus · Enterprise LATAM"). Começa com uma cópia da Personalização, das Permissões e das Habilidades do Agente padrão, com Memória vazia e sem Rotinas, e pode ser excluído.
_Avoid_: agente personalizado, cópia, clone

**Scopus**:
A Especialidade de ICP: define o perfil de cliente ideal e avalia a Aderência das Contas-alvo.

**Ethos**:
A Especialidade de Persona: descreve dores, objeções e gatilhos de cada papel do Comitê de compra.

**Rhetor**:
A Especialidade de escrita persuasiva: produz e-mails, sequências, posts e copy no tom da marca e por persona.

**Oraculum**:
A Especialidade de GEO (Generative Engine Optimization): mede e melhora como a marca aparece e é citada em respostas de LLMs.
_Avoid_: agente de SEO, agente geográfico

**Personalização**:
Os ajustes que o Cliente faz num Agente: instruções, tom de voz, base de conhecimento, ferramentas e canais. Não inclui renomear o Agente.
_Avoid_: customização

**Memória**:
Os fatos que um Agente aprendeu sobre o Cliente e seus usuários, cada um com origem e editável.

**Habilidade**:
Um procedimento que o Agente criou ou refinou com o uso e passa a reaplicar.
_Avoid_: skill, prompt, template

**Conversa**:
Uma troca entre um usuário e a Althius: direta com um Agente, ou coordenada, quando o pedido é feito sem escolher um Agente e a Coordenação distribui o trabalho.
_Avoid_: chat

**Rotina**:
Uma tarefa agendada que o Agente executa sozinho de forma recorrente.
_Avoid_: automação, cron

**Execução**:
Cada vez que um Agente é acionado (por Conversa, Menção, Coordenação, Rotina ou Canal) e entrega um resultado. A decisão de uma Aprovação não é uma Execução nova: é uma ação dentro da Execução que a propôs.

**Atividade**:
O histórico de tudo que um Agente fez, com o gatilho e o resultado: um item por Execução e um item por ação (agir sozinho pela Permissão Executar ou a decisão de uma Aprovação). O gatilho é o que acionou o trabalho (Conversa, Menção, Coordenação, Rotina ou Canal); uma ação herda o gatilho da Execução que a gerou, onde quer que a Aprovação seja decidida.
_Avoid_: log

**Menção**:
Chamar um Agente com @ no meio de uma Conversa, no estilo Grok. "@Scopus" chama o Agente padrão; um Agente criado é chamado pelo nome completo.

**Colaboração**:
Quando um Agente repassa trabalho a outro por conta própria (ex.: Scopus → Ethos → Rhetor).
_Avoid_: orquestração, pipeline

**Coordenação**:
Quando a Althius, sem ser um Agente e sem nome próprio, divide um pedido de uma Conversa coordenada entre os Agentes necessários e junta as respostas numa só. Um Agente @mencionado no pedido é sempre incluído; um pedido genérico pode ser respondido sem chamar nenhum Agente. A Coordenação não usa Integrações: quem age são os Agentes, cada um com a sua Permissão.
_Avoid_: orquestração, orquestrador, 5º agente

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
Uma ação proposta por um Agente que só acontece depois que um humano a aceita, na fila de Aprovações ou no Canal de origem. Guarda o gatilho da Execução que a propôs. Quando um Agente criado é excluído, as Aprovações dele, pendentes ou decididas, são excluídas junto.
_Avoid_: revisão, confirmação
