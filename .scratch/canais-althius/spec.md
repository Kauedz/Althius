# Canal WhatsApp da Althius: controlar o app inteiro por mensagem

Status: ready-for-agent (o adaptador real depende da resposta escrita da Meta sobre a cláusula 4.7)

Decisões de origem: [decisoes.md](./decisoes.md) (a rodada 4, W1 a W6, prevalece) e [ADR-0027](../../docs/adr/0027-canal-whatsapp-com-controle-total.md), que é a única fonte de verdade e substitui o ADR-0026. O mapa de ferramentas e riscos está na seção 3 de [arquitetura-controle-total-sms.md](./arquitetura-controle-total-sms.md); o resto desse documento foi substituído. Molde: [Canal Slack](../slack-canal/spec.md).

## Problem Statement

Vendedores, lideranças de marketing e o time da Althius passam o dia no WhatsApp. Hoje, para consultar uma Conta-alvo, saber quem respondeu, pausar uma Sequência, convidar alguém, conectar uma Integração ou aprovar uma mensagem, é preciso abrir a Althius no computador.

## Solution

A Althius ganha **um número de WhatsApp único**, com nome verificado "Althius", pela **Cloud API oficial direta**. Quem tem Participação liga o próprio **Telefone verificado** em Meu perfil (código pelo template de autenticação) e, num Workspace com o Canal habilitado, **faz tudo o que faria na tela**:
- cada pedido vira uma **Conversa coordenada**;
- os Agentes usam **ferramentas de plataforma**, que chamam as mesmas RPCs da tela em nome da pessoa (JWT de 60 s);
- o código decide o risco de cada ferramenta:
  - **leitura** responde direto;
  - **reversível** pede confirmação por **botões** Aprovar/Recusar ou "SIM";
  - **irreversível ou sensível** aceita a confirmação só com login nas últimas 12 h; senão, manda um link de uso único com login;
  - Integração conecta sempre por link OAuth.
- As respostas são curtas e formatadas para o WhatsApp, e o resto vai por link.
- Os avisos proativos são opt-in, das 09h às 21h, com no máximo 10 por dia. Fora da janela de 24h, só sai template aprovado.
- O custo fica com a Althius e o cliente só vê Créditos. O Canal é desenhado para caber nas 1.000 respostas de serviço grátis por mês. Os templates custam R$ 0,035 cada.

Princípio: **o chat nunca pode mais que a tela.**

## User Stories

### Habilitar e Telefone verificado
1. Como Administrador, quero habilitar e retirar o Canal WhatsApp em Conexões, sem apagar histórico.
2. Como Membro, quero ver o estado do Canal sem poder mudar.
3. Como participante, quero verificar meu celular em Meu perfil com um código de 6 dígitos pelo WhatsApp da Althius e ver estados e erros claros (não há SMS).
4. Como participante, quero que meu número não possa ser de outra Conta e que eu possa trocar ou remover. Ele fica suspenso se eu não fizer login na Althius por 30 dias.
5. Como participante, quero receber um e-mail quando um telefone for verificado na minha Conta.
6. Como participante, quero ligar ou desligar cada tipo de aviso proativo em Meu perfil.

### Reconhecimento, Workspace e Conversa
7. Como número desconhecido, quero uma resposta curta com o link de Meu perfil, sem Crédito, e no máximo uma por dia.
8. Como participante com vários Workspaces, quero uma lista numerada uma vez, o último Workspace lembrado, "trocar de workspace" e o nome do Workspace no início de cada Conversa.
9. Como participante, quero que uma Conversa nova comece com "nova conversa", depois de 4 horas de silêncio ou na troca de Workspace, e quero vê-la no app só para leitura, com a origem WhatsApp.
10. Como participante, quero "ainda estou trabalhando" se escrevo durante uma Execução, e uma falha clara quando ela falha.

### Controle total
11. Como participante, quero consultar pelo chat tudo o que vejo na tela: Créditos, Contas-alvo, Contatos, Sinais, Sequências, Rotinas, Playbooks, Agentes, Participações, Integrações e relatórios (sempre em Créditos).
12. Como vendedor, quero perguntar "quem respondeu hoje?" e receber uma lista numerada curta, para abrir uma resposta digitando o número.
13. Como participante, quero criar, editar, pausar e retomar Sequências e Rotinas, revisar o Playbook, criar e configurar Agentes, convidar pessoas e aceitar descobertas pelo chat, confirmando pelos botões.
14. Como participante, quero ver o custo em Créditos antes de qualquer ação que gaste Créditos.
15. Como vendedor, quero pedir "manda pro João da Acme dizendo X", ver o texto completo, o Contato e o canal, e confirmar pelo botão ou com "SIM" se fiz login há menos de 12 h. Senão, quero receber o link.
16. Como Administrador, quero ativar Sequência, apagar, mudar papel, remover Participação e mexer em Integração com a mesma regra de step-up ou link.
17. Como Administrador, quero conectar uma Integração recebendo um link OAuth de uso único, e nunca digitar uma chave no chat.
18. Como participante, quero que o chat recuse o que a tela me recusaria, com a mesma mensagem.
19. Como participante, quero que um botão ou "SIM" repetido, vencido ou de conteúdo alterado não faça nada.

### Avisos
20. Como participante com opt-in, quero ser avisado quando um lead responde, quando há uma Aprovação esperando, quando uma Rotina termina, quando chega um Sinal novo numa Conta minha, quando uma Sequência pausa ou quando os Créditos estão acabando, agrupado e dentro do horário.
21. Como participante, quero que PARAR desligue os avisos na hora, VOLTAR religue e AJUDA explique.

### Segurança e auditoria
22. Como Administrador, quero que toda ação pelo chat apareça na Atividade com Conta, canal, ferramenta e resultado, sem o texto da mensagem.
23. Como Administrador, quero limite de mensagens por número e por Workspace.

## Implementation Decisions

### Núcleo e adaptador
- **Adaptador do WhatsApp** (`_shared/canal/`) com uma interface:
  - validar `X-Hub-Signature-256` e normalizar (texto, áudio, clique em botão, outro tipo, status com o bloco `pricing`);
  - enviar texto;
  - enviar botões;
  - enviar template (autenticação, utilidade);
  - baixar a mídia.
  
  Há um **simulador** para testes e para o modo de desenvolvimento. O adaptador real é a Cloud API direta, sem BSP.
- **Edge `canal-whatsapp-events`** (sem JWT), no padrão `createHandler(deps)` do `slack-channel-events`: 200 rápido, reserva do id da mensagem (`wamid`) uma vez (padrão `claim_slack_channel_event`).
- **Entrega:** um gatilho no banco chama `canal-delivery` por `pg_net` quando a Execução termina. A mesma função drena os avisos.
- **Janela de 24h:** é calculada pela última mensagem recebida. Dentro dela, saem texto e botões (serviço). Fora dela, só o template de utilidade sem conteúdo, e o resultado fica pendente até a pessoa responder.
- **Contador de custo:**
  - a tabela de uso mensal por número soma respostas de serviço e templates pelo `pricing` dos status;
  - alerta à equipe da Althius em 800 respostas de serviço no mês;
  - em 1.000, pede uma decisão humana: pagar o excedente ou responder só com resumo e link.

### Ordem do handler
1. Assinatura e normalização. Os status de entrega só atualizam a entrega e o contador de custo.
2. Reenvio.
3. Comandos de opt-out (PARAR, VOLTAR, AJUDA), sem IA.
4. Identidade pelo Telefone verificado. Se não houver, recusa curta, sem Crédito e com teto diário.
5. Workspaces elegíveis (Participação ativa, Canal habilitado, contrato ativo ou Equipe Althius), com o último ou a lista.
6. Comandos e cliques: "trocar de workspace", "nova conversa", botões, SIM, NAO, "SIM n", números e MAIS. Os comandos resolvem um token ou uma sessão sem chamar o Agente.
7. Conversa atual e "ocupado".
8. RPC de service role `start_channel_run` (generalizando `start_slack_channel_run`), com `trigger_kind='canal'` e origem `whatsapp`.

### Identidade nas ferramentas (D2)
- Para cada chamada de ferramenta, o motor pede à Edge um JWT do usuário com `sub` = Conta, `role=authenticated`, `canal=whatsapp` e validade de 60 s, e chama a RPC da tela com ele.
- O segredo de assinatura nunca sai do servidor. O JWT nunca vai ao modelo nem ao log.

### Catálogo de ferramentas de plataforma (D7)
- Cada ferramenta tem um descritor: nome, RPC real, papéis e risco (`leitura | reversivel | irreversivel | oauth`). O mapa inicial está na seção 3 da [arquitetura](./arquitetura-controle-total-sms.md).
- O risco é **do código**. O Agente propõe a ferramenta, e o executor decide se roda, se pede SIM ou se manda o link.
- Lacunas de RPC que precisam ser criadas como RPCs de tela, usadas também pelo front:
  - `set_sequence_paused` (hoje a tela atualiza `sequences` direto);
  - outras que o ticket de cada área encontrar.

### Confirmação e step-up (D3)
- **Token de confirmação:**
  - é de uso único e fica guardado no banco;
  - fica ligado à Conta, ao Workspace, à ferramenta e ao hash do payload (padrão `private.approval_payload_hash`);
  - vale 10 min.
  
  "SIM" só funciona com um único token pendente. Com mais de um, a mensagem pede "SIM n".
- **Ações irreversíveis:** "SIM" vale se o último login da Conta na Althius foi há menos de 12 h. Senão, sai o **link de uso único** (`/a/<token>`), que exige login, mostra a confirmação e vence em 15 min.
- **Mensagem a lead:** passa pelas Propostas de resposta e pelas RPCs que já existem (`approve_reply_proposal`, Edge `reply-proposal-send`) e sai pela Conta remetente (Unipile). A leitura da caixa de leads continua pela Unipile.
- **Aprovações de ação:** `decide_approval` e `claim_approved_action`, sem mudar as regras de papel.
- **Integrações:** `start_integration_connect` gera o link OAuth. `save_integration_api_key` nunca é exposta ao chat.

### Formato
- Mensagens curtas, com a formatação do WhatsApp (negrito, listas, sem tabelas). Listas numeradas e MAIS para paginar. Uma resposta só por pedido sempre que possível, para poupar a faixa grátis. Texto longo vai como resumo e link de leitura com login.
- O cliente só vê Créditos. Nunca custo em dólar, nunca o provedor, nunca rótulos internos de nicho.

### Avisos proativos (D8)
- A tabela `channel_notices` é alimentada por gatilhos:
  - Proposta de resposta criada;
  - Aprovação pendente;
  - Rotina terminada;
  - Sinal novo em Conta-alvo da pessoa;
  - Sequência retida;
  - Créditos baixos.
- A entrega respeita o opt-in por tipo, o horário das 09h às 21h (America/Sao_Paulo), o agrupamento (1 mensagem a cada 30 min) e o teto de 10 por dia. Fora da janela, o aviso vira template de utilidade (R$ 0,035).

### Segurança
- Telefone verificado suspenso sem login na Althius por 30 dias (sem novo código) e e-mail ao verificar.
- Rate limit de 20 mensagens a cada 10 min e 200 por dia por número, mais um teto de Execuções por Workspace.
- Atividade com Conta, `canal`, ferramenta, hash e resultado, sem o texto.

### Custo (D5, R6)
- Mensagens do Canal, avisos, templates, recusas, comandos e escolha de Workspace não gastam Crédito. O custo da Meta (templates a R$ 0,035; serviço acima de 1.000/mês a R$ 0,035) fica com a Althius. O custo é da Althius e fica registrado à parte.
- As Execuções e as ações pagas (descoberta, revelar contato, buscar de novo) gastam Créditos pelas mesmas RPCs, e a cotação aparece antes.

## Testing Decisions
- **pgTAP:**
  - Telefone verificado (código, unicidade, suspensão por 30 dias sem login);
  - habilitação;
  - elegibilidade;
  - `start_channel_run`;
  - token de confirmação (uso único, hash, prazo, step-up de 12 h);
  - `channel_notices` (opt-in, horário, teto);
  - contador de custo;
  - `set_sequence_paused`.
- **Deno, com o simulador:**
  - assinatura;
  - número desconhecido;
  - PARAR/VOLTAR;
  - lista de Workspaces;
  - comandos e botões;
  - botão ou link conforme o último login;
  - a ferramenta com o JWT do usuário recebendo a mesma recusa da tela;
  - janela de 24h e pendentes;
  - avisos agrupados;
  - alerta em 800.
- **Motor:** Coordenação com ferramentas de plataforma, e o Slack continua verde.
- **Vitest:**
  - Meu perfil (telefone e opt-in);
  - cartão do WhatsApp em Conexões;
  - Conversa de origem WhatsApp;
  - página do link de ação.
- **Validação manual** com o número real (issue de validação ponta a ponta).

## Out of Scope (v1)
- iMessage, SMS (nem como reserva do código), E-mail como Canal e qualquer serviço pago (BSP).
- Grupos, imagens e arquivos recebidos. O áudio entra transcrito.
- Mensagens de marketing.
- Um número por Workspace.
- Escrever pela Althius numa Conversa de origem WhatsApp.
- Digitar chave de API ou segredo pelo chat.
- Falar com Contatos pelo número da Althius. Isso continua com as Contas remetentes (Unipile).

## Further Notes
- **Dependência externa:** a resposta escrita da Meta sobre a cláusula 4.7, que leva o ADR-0027 a `accepted`, e os templates aprovados. Todo o resto é construído atrás do simulador.
- **Custos diferentes de zero:** templates de autenticação e de utilidade (R$ 0,035 cada) e respostas de serviço acima de 1.000 por mês (R$ 0,035 cada). É preciso uma forma de pagamento cadastrada na Meta.
- A ordem das issues está em `issues/`.
