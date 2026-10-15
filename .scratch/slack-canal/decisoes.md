# Slack como Canal: decisões da fatia

Mapa das decisões tomadas na rodada de perguntas (Q1–Q21), antes da spec. Q1–Q6 só sobreviveram como resumo.

## Escopo (Q1–Q6)

- O Slack entra só como **Canal**. A Integração MCP do Slack fica fora desta fatia.
- O **Administrador** instala o app, e o workspace Slack fica fixo no primeiro install.
- Identidade: o e-mail do membro do Slack casado com a Participação no Workspace.
- Sem Coordenação.
- O DM entra.
- Aprovação só na fila nesta fatia (nada de botões na thread).

## Como se chama um Agente (Q7, Q10, Q14)

- **Q7:** um app só, o bot **@Althius**. No canal, a pessoa menciona o bot; no DM, abre a conversa com ele. No texto, `@Scopus` ou o nome completo, como a Menção na Althius (ADR-0004). Sem @Agente, nenhum Agente é chamado, inclusive no DM.
- **Q10:** só é mencionável o Agente que tem o Slack na lista de canais da Personalização.
- **Q14:** @Althius sem @Agente recebe uma resposta curta no thread ("mencione um Agente: @Scopus ou o nome completo"), sem Execução e sem crédito. Não é Coordenação.

## Thread e Conversa (Q8, Q13, Q15, Q19–Q21)

- **Q8:** o thread em que houve a menção vira a Conversa de quem mencionou. "A Conversa é de quem a começou."
- **Q21:** uma menção válida solta no canal recebe resposta num thread dessa mensagem, e esse thread é a Conversa. O bot nunca responde solto no canal.
- **Q19:** a primeira mensagem válida (@Althius + @Agente no canal, ou @Agente no DM) abre a Conversa. Depois, no mesmo thread ou DM, o texto da mesma pessoa continua com aquele Agente sem novo @. O "sem @ não responde" vale para abrir o fio, não para continuar.
- **Q20:** se mencionar outro Agente num fio já aberto, recebe recusa visível: este fio é do Agente X. Para falar com o outro, outro thread ou outro DM. Um thread, um dono, um Agente.
- **Q13:** se outra pessoa falar no thread de alguém, recebe recusa visível: este fio é a Conversa de quem mencionou primeiro. Ela começa a dela em outro thread ou no DM.
- **Q15:** a Conversa aparece na lista de Conversas de quem mencionou, na Althius. Nesta fatia, a resposta acontece só no Slack. Continuar pelo composer da Althius (com eco no thread) fica para depois.
- A Execução usa o gatilho Canal, já separado de Conversa.

## Identidade e workspace (Q9, Q12, Q18)

- **Q9:** se o e-mail do Slack não tiver Participação no Workspace, o bot responde no thread "não reconhecido", sem chamar Agente e sem registrar nada na Althius. Nunca cria visitante nem pede convite (ADR-0025).
- **Q12:** um workspace Slack amarra um único Workspace Althius. Um segundo install é recusado, como o portal do HubSpot.
- **Q18:** só aceita o membro do Slack fixado cujo e-mail é o da sessão Althius. Convidado, Slack Connect ou outro e-mail recebem a mensagem do Q9.

## Fora desta fatia (Q11, Q16)

- **Q11:** a Rotina não publica no Slack. A fatia é só inbound: menção → resposta no thread.
- **Q16:** só texto (com o @ do Agente). Anexo, áudio e canvas são ignorados; se vier só arquivo, o bot avisa.

## Retirar o Canal (Q17)

- Se o Administrador retira o Canal ou desinstala o app, o bot para de responder. Conversas e Atividade ficam. Para voltar, basta instalar de novo no mesmo Slack (Q12).
