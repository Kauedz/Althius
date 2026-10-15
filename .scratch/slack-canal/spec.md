# Slack como Canal: falar com um Agente pelo Slack

Status: ready-for-agent

Decisões de origem: [decisoes.md](./decisoes.md) (Q1–Q21). Leia antes o [guia da plataforma](../../docs/visao-geral-da-plataforma.md).

## Problem Statement

O time do Cliente passa o dia no Slack, mas para falar com um Agente precisa abrir a Althius. No Workspace operacional, o Slack aparece em Conexões como Canal "Em breve": a única versão que funciona é a prévia simulada da Demonstração. A lista de canais da Personalização de cada Agente já aceita "slack", mas não tem efeito nenhum. Hoje não há como mencionar o Scopus num thread do Slack e receber a resposta ali.

## Solution

O Administrador instala no Workspace um app do Slack, o bot **@Althius**. O workspace Slack da primeira instalação fica fixo, e um workspace Slack só serve a um Workspace Althius.

Depois disso, qualquer participante abre um fio:
- **no canal:** menciona o bot e, no texto, um Agente (`@Scopus` ou o nome completo de um Agente criado, como a Menção da Althius);
- **no DM com o bot:** menciona só o Agente.

A Althius reconhece a pessoa pelo e-mail do Slack. A conversa segue assim:
- **Abertura:** a Althius abre uma Conversa de verdade em nome de quem mencionou, com aquele Agente, e o Agente responde num thread da mensagem.
- **Continuação:** no mesmo thread, a mesma pessoa continua falando com o mesmo Agente sem mencionar de novo.
- **Recusas:** outra pessoa no thread, outro Agente no thread, @Althius sem Agente e e-mail não reconhecido recebem uma resposta curta no thread, sem chamar Agente.
- **Na Althius:** a Conversa aparece na lista de Conversas de quem mencionou, só para leitura; responder continua sendo pelo Slack.

Aprovações propostas pelo Agente vão para a fila da Althius. Se o Administrador retirar o Canal, o bot para de responder e nada some.

## User Stories

### Instalação e retirada

1. Como Administrador, quero conectar o Slack como Canal na tela Conexões, para que o time fale com os Agentes sem sair do Slack.
2. Como Administrador, quero autorizar a instalação do app @Althius pelo fluxo oficial do Slack, para não precisar copiar chaves.
3. Como Administrador, quero que o workspace Slack da primeira instalação fique fixo no Workspace, para que ninguém troque o Slack por engano depois.
4. Como Administrador, quero que reinstalar com outro workspace Slack seja recusado com uma mensagem clara, para entender por que não funcionou.
5. Como Administrador, quero que um workspace Slack já ligado a outro Workspace Althius seja recusado, para que as Participações e Permissões de dois Workspaces não se misturem.
6. Como Membro, quero ver em Conexões se o Canal Slack está ativo, sem poder instalar nem retirar, porque isso é papel do Administrador.
7. Como Administrador, quero retirar o Canal Slack, para que o bot pare de responder.
8. Como Administrador, quero que retirar o Canal não apague nenhuma Conversa nem a Atividade, para não perder o histórico.
9. Como Administrador, quero voltar a usar o Canal reinstalando no mesmo workspace Slack, para retomar depois de uma pausa.
10. Como Administrador, quero que, se alguém desinstalar o app pelo próprio Slack, a Althius mostre o Canal como retirado, para a tela não mentir.

### Chamar um Agente

11. Como participante, quero mencionar @Althius num canal e escrever "@Scopus" no texto, para pedir algo ao Scopus ali mesmo.
12. Como participante, quero chamar um Agente criado pelo nome completo ("@Scopus · Enterprise LATAM"), igual na Althius.
13. Como participante, quero abrir um DM com o bot e escrever "@Ethos …", para falar com um Agente em particular.
14. Como participante, quero que @Althius sem nenhum @Agente receba uma resposta curta explicando como mencionar um Agente, para o bot não parecer quebrado.
15. Como participante, quero que esse aviso não gaste Créditos nem crie Execução, porque nenhum Agente trabalhou.
16. Como participante, quero que no DM uma mensagem sem @Agente também receba o aviso, em vez de chamar um Agente padrão escondido.
17. Como Administrador, quero que só os Agentes com o Slack na lista de canais da Personalização possam ser mencionados no Slack, para que essa lista tenha efeito.
18. Como participante, quero que mencionar um Agente que não atende no Slack receba uma resposta dizendo isso, para eu saber o que aconteceu.
19. Como participante, quero que a Coordenação não exista no Slack, para saber sempre qual Agente está me respondendo.

### O fio e a Conversa

20. Como participante, quero que o Agente sempre responda num thread da minha mensagem, nunca solto no canal, para não poluir o canal.
21. Como participante, quero que o thread em que mencionei vire a minha Conversa com aquele Agente, para o contexto se manter.
22. Como participante, quero continuar escrevendo no mesmo thread sem mencionar de novo, para conversar de forma natural.
23. Como participante, quero que o Agente lembre o que já foi dito no thread, porque é a mesma Conversa.
24. Como participante, quero que mencionar outro Agente no meu thread receba uma recusa dizendo que este fio é do Agente atual, para eu abrir outro fio para o outro.
25. Como participante, quero que outra pessoa que escreva no meu thread receba uma recusa dizendo que este fio é meu, para que ninguém herde o meu contexto.
26. Como outra pessoa no canal, quero saber pela recusa que posso abrir o meu próprio fio em outro thread ou no DM.
27. Como participante, quero que uma mensagem enviada enquanto o Agente ainda responde no fio receba "ainda respondendo", em vez de se perder.
28. Como participante, quero ver na Althius, na minha lista de Conversas, a Conversa que nasceu no Slack, para reencontrá-la.
29. Como participante, quero que essa Conversa mostre que veio do Slack e que se continua lá, para não tentar responder pela Althius.
30. Como Administrador, quero que as Conversas do Slack respeitem "a Conversa é de quem a começou", sem aparecer para outros participantes como se fossem deles.

### Identidade

31. Como participante, quero ser reconhecido pelo e-mail da minha conta do Slack, sem ter que vincular nada.
32. Como pessoa do Slack sem Participação no Workspace, quero uma resposta "não reconhecido" no thread, para entender que não tenho acesso.
33. Como Administrador, quero que uma pessoa não reconhecida nunca vire usuário, visitante ou convite, porque Acesso é por contrato e por convite.
34. Como Administrador, quero que convidados do Slack e pessoas de Slack Connect recebam a mesma resposta de não reconhecido, mesmo que o e-mail case.
35. Como Administrador, quero que uma pessoa removida do Workspace deixe de ser atendida no Slack na hora, porque a Participação é o que dá acesso.

### Execução, Créditos e Aprovações

36. Como Administrador, quero que cada resposta do Agente no Slack seja uma Execução com gatilho Canal na Atividade, para auditar de onde veio o trabalho.
37. Como Administrador, quero que a Execução pelo Slack gaste Créditos como uma Conversa na Althius, para o consumo ser previsível.
38. Como participante, quero que, sem Créditos ou sem contrato ativo, o thread diga claramente que não foi possível responder, sem resposta inventada.
39. Como participante, quero que uma falha do Agente apareça no thread como falha, nunca como uma resposta que finge ter feito o trabalho.
40. Como participante, quero que uma ação que o Agente propõe vire uma Aprovação na fila da Althius e que o thread diga que ela está esperando lá.
41. Como Administrador, quero que essa Aprovação guarde o gatilho Canal, para a Atividade mostrar de onde veio o pedido.
42. Como participante, quero que o Agente no Slack siga as mesmas Permissões (Ler, Propor, Executar) que tem na Althius.

### Conteúdo

43. Como participante, quero que só o texto da minha mensagem chegue ao Agente nesta fase, para o comportamento ser previsível.
44. Como participante, quero que uma mensagem só com arquivo, áudio ou canvas receba um aviso de que só texto é lido, para não esperar uma resposta que não vem.
45. Como participante, quero que editar ou apagar uma mensagem já enviada não dispare o Agente de novo.
46. Como participante, quero que uma mensagem minha seja respondida uma vez só, mesmo que o Slack reenvie o evento.

## Implementation Decisions

### Canal, não Integração

- O Slack desta spec é o **Canal** (onde se conversa com um Agente). A Integração Slack pelo servidor MCP, já no catálogo de conectores, fica como está e fora desta fatia. São apps do Slack, segredos e registros diferentes.
- O app é um bot só, @Althius (ADR-0004: nos Canais é preciso @mencionar um Agente). Não existe um bot por Agente.

### Instalação (Q2, Q4, Q12, Q17)

- **Registro novo no banco:** a instalação do Canal Slack por Workspace guarda o Workspace, o id do workspace Slack (`team_id`), o id do usuário do bot, o estado (ativo ou retirado), quem instalou e quando. O token do bot vai para o Vault, como os tokens das Integrações, e o banco guarda só o nome do segredo. RLS explícito, sem acesso direto: tudo passa por RPCs.
- **Regras de unicidade:** um `team_id` ativo ou retirado pertence a um Workspace só, e um segundo Workspace com o mesmo `team_id` é recusado (Q12). Um Workspace tem no máximo um `team_id` para sempre, e reinstalar com outro é recusado (Q4, Q17).
- **Fluxo de instalação:** segue o mesmo padrão do conectar e do retorno das Integrações (tentativa com `state` de uso único, retorno sem JWT em que o `state` é a autenticação). Só um Administrador ativo inicia. O retorno troca o código pelo token do bot e chama uma RPC que fixa o `team_id` ou recusa.
- **Escopos do bot:** só os necessários: ler menções ao app, ler o histórico do DM com o app e dos canais em que o bot está, postar mensagens e ler os usuários com e-mail.
- **Retirar:** um Administrador retira pela tela Conexões, o que revoga o token no Slack e marca a instalação como retirada. Os eventos de desinstalação e de revogação de token vindos do Slack também a marcam como retirada. Conversas, Execuções e Atividade ficam.
- **Segredos novos da função:** o segredo de assinatura e o id e o segredo do cliente do app do Canal, distintos dos segredos do app MCP.

### Recebimento de eventos

- Uma Edge Function nova, sem JWT, recebe a API de eventos do Slack. O handler segue o padrão `createHandler(deps)` das funções existentes, com o banco, o cliente da API do Slack, o relógio e os segredos injetados.
- **Autenticação:**
  - assinatura do Slack (HMAC-SHA256 sobre `v0:{timestamp}:{corpo}`), comparada em tempo constante, com janela de 5 minutos, como a verificação dos webhooks da Unipile e do Stripe;
  - o desafio de verificação de URL é respondido.
- **Resposta rápida:** confirma com 200 em menos de 3 segundos e processa depois da confirmação.
- **Reenvios:** cada `event_id` é reservado uma vez no banco (como `claim_stripe_event`). Um reenvio já reservado é confirmado sem efeito (US 46).
- **Eventos tratados:** a menção ao app no canal e a mensagem no DM com o app. São ignorados as mensagens de bots (inclusive as do próprio @Althius), as edições, as remoções e outros subtipos (US 45).
- **Mensagens de canal sem menção ao bot:** para continuar sem @ num thread de canal (Q19), o app também assina as mensagens dos canais em que o bot está e trata só as que caem num thread já mapeado como fio. As outras são ignoradas sem resposta. Isso exige o escopo de leitura do histórico desses canais; o ticket de implementação confirma na documentação oficial do Slack o escopo e o evento que entregam as respostas de thread, e registra a fonte.

### Do evento à decisão (Q7, Q9, Q10, Q13, Q14, Q16, Q18–Q21)

A ordem das verificações, dentro do handler:

1. **Instalação ativa** para o `team_id` do evento. Se não houver, a função ignora o evento (não há bot para responder).
2. **Identidade (Q9, Q18).**
   - Se o autor for convidado do Slack (restrito ou ultra-restrito) ou membro de outro workspace Slack (Slack Connect), a resposta é "não reconhecido".
   - Senão, a Althius lê o e-mail pela API de usuários do Slack e procura uma Conta de usuário com esse e-mail verificado e Participação ativa no Workspace. Sem isso, a resposta também é "não reconhecido".
   - A Althius nunca cria Conta, convite nem visitante, e não registra nada.
3. **Fio existente:** a chave do fio é `team_id` + canal + `thread_ts`. Quando a mensagem está num thread já mapeado:
   - de outra pessoa: recusa "este fio é a Conversa de @dono" (Q13);
   - do dono, mencionando um Agente diferente do Agente do fio: recusa "este fio é do Agente X; para falar com outro, abra outro thread" (Q20);
   - do dono, com texto: continua a Conversa com o Agente do fio, sem exigir @ (Q19).
4. **Fio novo:** quando a mensagem não está num thread mapeado.
   - Remove-se do texto a menção ao bot e reconhecem-se as Menções pela mesma regra do app (`reconhecerMencoes`, já no compartilhado das funções), aplicada só aos Agentes com "slack" na lista de canais da Personalização (Q10).
   - Sem Agente: o aviso do Q14 ("mencione um Agente: @Scopus ou o nome completo").
   - Agente mencionado que não está na lista: "esse Agente não atende no Slack" (US 18).
   - Mais de um Agente: recusa pedindo um Agente por fio.
   - Com exatamente um Agente: abre o fio, com o `thread_ts` da própria mensagem quando ela estava solta (Q21).
5. **Conteúdo (Q16):** só o texto segue. Uma mensagem sem texto útil, só com arquivo, áudio ou canvas, recebe o aviso "só leio texto por enquanto".
6. **Todas as respostas do bot vão no thread do fio,** nunca soltas no canal ou no DM. O aviso do Q14, as recusas e o "não reconhecido" não criam Execução, Conversa nem consumo de Crédito.

**DM.** O fio é um thread, como no canal:
- uma mensagem solta no DM com @Agente abre um fio, respondido no thread dela;
- dentro do thread a pessoa continua sem @;
- uma nova mensagem solta no DM com outro @Agente abre outro fio ("outro DM" do Q20).

Isso mantém uma regra só para canal e DM. Esta é uma interpretação do Q19/Q20: veja Further Notes.

### Fio e Conversa (Q8, Q15)

- **Registro novo:** o fio do Slack (`team_id`, canal, `thread_ts`) aponta para a Conversa, o dono (Conta de usuário) e o Agente. Ele é único por chave de fio.
- **A Conversa:**
  - é uma Conversa direta com o Agente (`kind = 'agente'`), cujo dono é quem mencionou;
  - ganha a **origem** (Althius ou Slack), numa coluna aditiva com padrão Althius;
  - aparece na lista de Conversas do dono pelas RPCs existentes, que passam a devolver a origem.
- **Na tela da Althius,** a Conversa de origem Slack mostra os passos como qualquer outra, mas o composer fica desabilitado com "Esta Conversa continua no Slack" (Q15). Escrever pela Althius com eco no thread fica para depois.

### Execução com gatilho Canal

- O gatilho da Execução (`trigger_kind`) passa a aceitar `canal`, numa migration aditiva que amplia o `check`.
- **RPC nova, só para o service role,** que inicia uma Execução em nome de uma Conta de usuário identificada pelo servidor (no padrão de `begin_crm_handoff_by_agents`). Ela:
  - confere a Participação ativa, o contrato (ADR-0025) e o Agente na lista de canais;
  - cria a Conversa e o fio, ou continua os existentes, e grava o pedido com `trigger_kind = 'canal'`;
  - usa o `event_id` do Slack como `client_request_id`, para ser idempotente;
  - recusa com "ocupado" quando o fio já tem uma Execução aberta, o que vira a resposta "ainda respondendo" (US 27).
- Daí em diante vale o mesmo contrato com o banco de qualquer motor (`claim_agent_run`, `append_agent_run_event`, `finish_agent_run`): a ponte `agent-conversation` ou o worker do Hermes rodam o pedido sem saber que veio do Slack.
- **Um Agente por fio:** a Execução de um fio do Slack roda só com o Agente do fio. As Menções que o próprio Agente escrever não puxam outro Agente para a rodada (o "Agente chama Agente" do PR-11 não vale aqui). Assim fica um thread, um dono, um Agente (Q20).
- Créditos, tetos e Permissões são exatamente os da Conversa: a rodada é cobrada pela mesma regra, e a Permissão Propor cria a Aprovação na fila com o gatilho Canal.

### Entrega da resposta no thread

- Um gatilho no banco, quando uma Execução com `trigger_kind = 'canal'` termina (bem-sucedida ou com falha, inclusive expirada por prazo), chama por `pg_net` uma Edge Function de entrega com o id da Execução e um segredo interno. A entrega independe do motor que rodou.
- **A função de entrega:**
  - lê a resposta final, a falha, ou as Aprovações pedidas pela Execução, e posta no thread do fio com o token do bot;
  - marca a Execução como entregue, para nunca postar duas vezes;
  - quando a Execução falha, posta uma falha clara, com o motivo humano (sem Créditos, sem contrato, erro do Agente), nunca uma resposta inventada;
  - quando há uma Aprovação pendente, posta que ela aguarda na fila da Althius, sem botões no Slack;
  - quando o Canal foi retirado entre o pedido e a entrega, não posta e só marca.

### Limites e falhas de postagem

- **Limite do Slack (429):** toda postagem (`chat.postMessage`) respeita o `Retry-After` do Slack e tenta de novo; 5xx e rede fora também são tentados, com espera crescente, até 3 vezes. Uma espera pedida maior que 5 segundos não é esperada: a falha sobe e vai para a nova tentativa da entrega.
- **Entrega confirmada (ticket 09):** reservar (prazo de 2 minutos), postar e só então confirmar. Falha ao postar solta a reserva com o motivo e a tentativa; um relógio no `pg_cron` (a cada 2 minutos) pede a entrega de novo, até 5 tentativas; uma recusa do Slack desiste na hora. Tudo no log com o `run_id`, sem texto nem token.
- **Limite de uso (ticket 08):** por padrão, 20 pedidos por pessoa a cada 10 minutos e 200 por Workspace por hora, ajustáveis por Workspace na instalação do Canal. Passou, recusa curta no thread, sem Execução nem Crédito. Se a leitura do limite falhar, o pedido segue.

### Frontend

- A Fonte real de Conexões deixa o Canal Slack sair de "Em breve":
  - estado ativo ou retirado;
  - Conectar e Retirar só para o Administrador;
  - mensagens de recusa da instalação (outro Slack; Slack de outro Workspace).
- Os outros Canais continuam "Em breve".
- A Conversa de origem Slack mostra uma marca de origem e o composer desabilitado.
- A Demonstração continua simulada e intocada.

## Testing Decisions

- **O que é um bom teste aqui:** um teste que entra por onde o mundo entra e confere o que sai: um evento assinado do Slack produz chamadas ao banco e mensagens postadas no thread; uma chamada à RPC produz linhas e recusas visíveis. Sem testar funções internas nem a ordem de chamadas que não importa.
- **Ponto 1, o handler de eventos do Slack (Deno),** com banco, cliente do Slack e relógio falsos. Cobre:
  - assinatura válida e inválida, janela de tempo, desafio de URL e reenvio do mesmo `event_id`;
  - identidade: e-mail sem Participação, convidado, Slack Connect, Participação removida;
  - o aviso do Q14 sem Execução, o Agente fora da lista, mais de um Agente e a mensagem só com arquivo;
  - fio novo solto no canal com resposta no thread, continuação sem @, outra pessoa no fio, outro Agente no fio, e "ocupado";
  - o DM, e os eventos ignorados (bots, edições, remoções).

  Prior art: os testes do handler do `stripe-webhook`, os do `unipile-account-status` e os do `agent-conversation`.
- **Ponto 2, o banco (pgTAP), um arquivo por migration:**
  - instalação fixando o `team_id`, recusas de outro Slack e de Slack em outro Workspace, retirar e reinstalar no mesmo Slack;
  - a RPC de Execução pelo Canal: só service role, Participação, contrato, lista de canais, idempotência pelo `event_id`, ocupado, `trigger_kind = 'canal'`;
  - o fio aponta para uma Conversa cujo dono é quem mencionou e que aparece só para ele nas RPCs de listagem, com a origem;
  - retirar não apaga Conversas nem Execuções;
  - RLS e isolamento entre Workspaces.

  Prior art: os testes SQL de conversas dos agentes, de acessos às integrações e de rotinas que rodam sozinhas.
- **Ponto 3, a entrega (Deno),** com banco e cliente do Slack falsos: resposta de sucesso postada no thread certo, falha postada como falha, Aprovação pendente avisada, entrega uma vez só, Canal retirado sem postar. No pgTAP: o gatilho só dispara para `trigger_kind = 'canal'` e em estados finais.
- **Frontend (vitest):** Conexões com o Canal Slack real (Administrador com Conectar e Retirar, Membro só lendo, mensagens de recusa) e a Conversa de origem Slack com o composer desabilitado. Prior art: os testes de Conexões reais e os das Fontes de Conversas.
- **Testes existentes não mudam;** cada ticket só acrescenta testes.

## Out of Scope

- A Integração Slack pelo servidor MCP (os Agentes lendo ou escrevendo no Slack como ferramenta).
- A Coordenação no Slack.
- A Aprovação decidida no Slack (botões no thread): a Aprovação fica só na fila.
- A Rotina publicando no Slack (outbound, `canalDestino`).
- Responder pela Althius com eco no thread do Slack.
- Anexos, imagens, áudio e canvas.
- Um bot por Agente.
- Um workspace Slack servindo vários Workspaces Althius.
- Convidados, Slack Connect e vínculo de um segundo e-mail.
- Canais privados sem menção: continuar um fio sem @ num canal privado precisaria de `groups:history` e `message.groups`. Fora da v1 (decisão do Renan, 2026-10-15); a menção ao bot num canal privado continua funcionando.
- WhatsApp, Microsoft Teams e E-mail como Canais.
- Mudanças na Demonstração.

## Further Notes

Pontos de interpretação a confirmar no primeiro ticket. As decisões Q1–Q21 não os cobrem literalmente:

- **DM com threads:** tratar cada mensagem solta no DM como abertura de um fio respondido em thread é a leitura que concilia o Q19 ("continua no mesmo DM sem @") com o Q20 ("para o outro Agente, outro DM"), porque só existe um DM com o bot.
- **Mais de um Agente na mensagem de abertura:** recusar e pedir um Agente por fio decorre do "um thread, um Agente" do Q20.
- **Agente chama Agente** desligado nas Execuções do Canal, pela mesma razão.
- **Escopo de leitura dos canais** para continuar sem @ no thread do canal: necessário para o Q19 no canal. Confirmar na documentação oficial do Slack antes do ticket.
- **Agente mencionado fora da lista de canais:** responder que ele não atende no Slack, em vez de tratar como sem Agente.

Passos do Nan (vão nos tickets):
- criar o app @Althius em api.slack.com com a URL de eventos, a URL de retorno da instalação e os escopos do bot;
- gravar os segredos novos;
- publicar as funções novas sem verificação de JWT;
- aplicar as migrations conforme `docs/agents/migrations.md`;
- instalar num Slack de teste e conferir de ponta a ponta.

Relação com o ticket 22 de `conexoes-funcionais`: aquele ticket trata o Slack como Integração pelo MCP. Esta spec trata o Slack como Canal e não o fecha nem o altera.
