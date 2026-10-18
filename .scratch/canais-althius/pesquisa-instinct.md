# Pesquisa: engenharia reversa do Instinct (agente por mensagem)

Data da pesquisa: 2026-10-14. Convenção: **FATO** tem fonte primária citada; **INFERÊNCIA** é leitura minha e vem marcada. Parte dos fatos sai do **código público do frontend** (`app.instinct.com/assets/*.js`, o mesmo bundle servido em `instinct.com` e `app.instinct.com`). O nome de um campo ou de uma tela é FATO. O que ele revela sobre o backend continua INFERÊNCIA. Os nomes dos arquivos do bundle mudam a cada deploy, então essas URLs vão envelhecer.

## Resumo

- O Instinct (Spear Street Technology, Inc., San Francisco, fundador Noah Shinn) é um agente pessoal para consumidor. Não tem interface nova: a pessoa manda texto ou liga, e ele usa telefone e computador como um humano. Está em beta só por convite.
- Canais: iMessage e WhatsApp como canais principais, SMS no login e no convite, e-mail próprio do agente (`mail.instinct.com`), ligações (Concierge) e grupos. Os detalhes de conta, conexões e aprovações sensíveis ficam numa web app (`app.instinct.com`) e num app de Mac.
- Identidade: a conta é o **telefone verificado por código de uso único (OTP)**, enviado por SMS ou WhatsApp. Um WhatsApp em outro número se liga à mesma conta por um segundo OTP com `bindingToken`, e um e-mail do iCloud se liga por um código mandado por iMessage.
- Ações perigosas saem do chat e vão para um **link da web app**, que exige login com o telefone da conta. Lá ficam a aprovação de credenciais do cofre (Vault), o checkout de hotel e voo (Stripe e Duffel), a confiança em grupos e a conexão de integrações. Os Termos avisam que as confirmações não são garantidas e que ações podem ser irreversíveis.
- Provedor: nenhum documento público nomeia Twilio, Meta ou outro. Só o Google aparece na política. O WhatsApp oficial (Cloud API ou BSP) é provável, mas é INFERÊNCIA.
- Para a Althius, o molde do Canal Slack serve quase inteiro. Muda a identidade (telefone verificado no lugar do e-mail do Slack), o fio (o WhatsApp não tem thread) e surgem a janela de 24h e os templates da Meta. A cláusula 4.7 da Meta, que barra provedores de IA de uso geral, é o risco regulatório principal. O Unipile (QR) é rápido, mas viola os termos do WhatsApp para uso não pessoal e automatizado.

## Qual produto é (e os candidatos descartados)

**Escolhido: Instinct, de Spear Street Technology, Inc. d/b/a Instinct** (instinct.com / app.instinct.com).
- FATO: a entidade é "Spear Street Technology, Inc. d/b/a Instinct" ([Termos](https://instinct.com/terms), [Privacidade](https://instinct.com/privacy-policy)).
- FATO: o fundador diz: "Instinct is a personal agent [...] there are no new interfaces. You can text or call it. It's trained to use a phone and a computer in the same way that humans do." Diz também que o produto está em "invite-only beta" ([Noah Shinn, X, 2026-08-26](https://x.com/noahrshinn/status/2092691344456351744)).
- FATO: a home diz que o assistente "understands what you're working on and what's important to you", tem o botão "Text Instinct" e dá como exemplos contestar uma cobrança, mandar presentes, fazer compras de mercado, marcar médico e planejar um fim de semana ([instinct.com](https://instinct.com)).
- Por que este: é o único "Instinct" que recebe mensagem por WhatsApp e SMS e executa trabalho. O código da web app tem as telas "Connect your WhatsApp", "You can reach Instinct on iMessage or WhatsApp" e o login por SMS e WhatsApp ([bundle](https://app.instinct.com/assets/app-C-Jgxgav.js), [OnboardingPage](https://app.instinct.com/assets/OnboardingPage-tQE3TyJa.js)).

**Descartados:**
- Instinct Science (instinct.vet): software de prontuário veterinário. Não tem agente por mensagem.
- Instinct Pet Food e Instinct Dog Training: não são software.
- "Instinkt": a busca não achou produto de agente com esse nome. Os resultados apontavam para o próprio Instinct.
- O Samsung Instinct (celular antigo) e o Garmin Instinct (relógio) também não se encaixam.

## Como funciona

### 1. O que é, para quem e qual job resolve

- FATO: é um "personal assistant powered by artificial intelligence" que gera Output e toma Actions em seu nome, inclusive em "Connected Services" ([Termos](https://instinct.com/terms)).
- FATO: o público é o consumidor final ("AI for the rest of us", em oposição a "AI for Enterprise"), segundo o post de um investidor, Pranav Reddy, da Conviction ([X, 2026-08-26](https://x.com/pranavreddy/status/2092710913329770808)). Os Termos exigem 18 anos ou mais ([Termos](https://instinct.com/terms)), e o onboarding recusa quem tem menos de 18 ("You need to be 18 or older to use Instinct.", [OnboardingPage](https://app.instinct.com/assets/OnboardingPage-tQE3TyJa.js)).
- FATO: o job é delegar tarefas da vida real que exigem ir e voltar com terceiros. Exemplos do fundador:
  - viagens, compras de mercado, ingressos e cancelamento de assinaturas ([X, 08-26](https://x.com/noahrshinn/status/2092691344456351744));
  - devoluções com contato ao suporte ([X, 09-08](https://x.com/noahrshinn/status/2097443135177798060));
  - ligações para restaurantes, dentistas e a operadora de TV a cabo ([Concierge, X, 09-16](https://x.com/noahrshinn/status/2100262985491231101));
  - atendimento ao cliente agente-a-agente com empresas na Sierra e na Decagon ([X, 10-07](https://x.com/noahrshinn/status/2107875073038385546)).
- FATO: "Instinct users who make purchases spend over $1300/month on average through Instinct" ([X, 08-28](https://x.com/noahrshinn/status/2093368510449877180)).

### 2. Identidade e conexão

**O número é único ou dedicado?**
- FATO: o frontend consulta `agentContact { smsPhoneNumber voicePhoneNumber voiceCallsEnabled whatsAppChannelPhoneNumber email agentMailStatus agentPhoneNumber agentPhoneStatus }`, uma vez por usuário logado e atualizado a cada 15 s. Com isso monta os links `sms:<número>?body=…` e `https://wa.me/<número>` ([bundle](https://app.instinct.com/assets/app-C-Jgxgav.js)).
- FATO: o convite carrega o número do Instinct na URL. Se ele faltar, aparece "The invite link is missing Instinct's phone number." ([TextInstinctPage](https://app.instinct.com/assets/TextInstinctPage-D4b_jKoS.js)).
- FATO: existe uma tela de migração com "Found your new number!" e o botão "Open iMessage" ([TextMigrationPage](https://app.instinct.com/assets/TextMigrationPage-DcTTHk4G.js)).
- FATO: cada Instinct tem um e-mail próprio, reivindicado em `mail.instinct.com`. O fundador chama isso de "first step towards enabling your Instinct to own and run its own accounts" ([X, 09-08](https://x.com/noahrshinn/status/2097443132816396649)). O endereço pode mudar 3 vezes por dia, e o antigo continua encaminhando ([WorkspacePage](https://app.instinct.com/assets/WorkspacePage-CnziGKDx.js)).
- INFERÊNCIA: o número de contato (SMS, iMessage e WhatsApp) **não é um só global e fixo**. Ele vem por usuário do servidor, pode mudar (a migração "new number") e viaja no convite. Isso combina com um **pool de números** distribuídos entre os usuários: um número por usuário seria caro no iMessage, e um número só para todos não pediria migração. Há ainda um `agentPhoneNumber` com status próprio, separado do número de conversa, que parece ser o telefone **dedicado do agente** para agir no mundo (ligar e criar contas). Não deu para confirmar se o WhatsApp é um número só para todos.

**Como reconhece quem escreve:**
- FATO: o login é "Sign in or create your Instinct account. [...] Use its sign-in number here. You'll connect WhatsApp after setup." Depois vem "We sent a 6-digit code by SMS to …" ou "on WhatsApp to …", com as opções "Send SMS instead" e "Send via WhatsApp instead" ([AuthFlow](https://app.instinct.com/assets/AuthFlow-CkDa3VD1.js)). Os Termos confirmam: "one-time verification code" por texto a cada login ([Termos](https://instinct.com/terms)).
- FATO: para ligar o WhatsApp, o fluxo é este ([bundle](https://app.instinct.com/assets/app-C-Jgxgav.js)):
  - a tela pede "Use the same Instinct in WhatsApp, even if you use a different phone number there.";
  - a pessoa preenche "Enter your WhatsApp phone number";
  - a mutation `requestWhatsAppChannelPhoneOtp(phoneNumber, preferredChannel: SMS|WHATSAPP)` devolve `bindingToken`, `deliveryChannel`, `resendAfterSeconds` e `canSendWhatsApp`;
  - `connectWhatsAppChannel(phoneNumber, code, bindingToken, signupToken)` fecha a ligação;
  - se o código não chega, a dica é "No code yet? Look for a separate Instinct chat in WhatsApp."
- FATO: o iMessage vindo de um e-mail do iCloud é reconhecido assim: "We noticed you started texting us from this email. We'll send a code to it as an iMessage to confirm it's yours." ([LinkIcloudPage](https://app.instinct.com/assets/LinkIcloudPage-CIw8SBaf.js)).
- FATO: links mandados pelo agente exigem a conta certa: "Use the sign-in phone number for the Instinct account that received this link." ([ActionLinkAccess](https://app.instinct.com/assets/ActionLinkAccess-BfVY2h7A.js)). Há também `redeemTextSignup(token)`, que devolve `userId` e `phoneNumber` ([TextOnboardingPage](https://app.instinct.com/assets/TextOnboardingPage-D7MUOQ8T.js)).
- INFERÊNCIA: a identidade é **o número de quem escreve, já verificado por OTP e ligado a um `userId`**. Uma mensagem de número desconhecido provavelmente cai no fluxo de cadastro ou na lista de espera (`/text-onboarding`, `/whatsapp-onboarding`, `/waitlist`) e não é atendida como usuário.

**Onboarding passo a passo** (FATO pelas rotas e telas do bundle, ordem por INFERÊNCIA):
1. Convite: "Instinct is in invite-only beta", "US phone numbers only.", "You have 10 invites". Sem vaga, a pessoa entra na lista de espera ("we'll text you the moment a spot opens") ([InvitePage](https://app.instinct.com/assets/InvitePage-CimL2aoJ.js)).
2. Login por telefone, com o OTP por SMS ou WhatsApp e um captcha do Turnstile. O consentimento diz: "I agree to Instinct's Terms of Service and SMS Terms, and acknowledge the Privacy Policy." ([AuthFlow](https://app.instinct.com/assets/AuthFlow-CkDa3VD1.js)).
3. Perfil: nome, e-mail, data de nascimento (18 anos ou mais) e gênero (`submitSignupProfile`) ([OnboardingPage](https://app.instinct.com/assets/OnboardingPage-tQE3TyJa.js)).
4. "Connect Google" (Google Workspace) ([bundle](https://app.instinct.com/assets/app-C-Jgxgav.js)).
5. Escolha do canal: "You can reach Instinct on iMessage or WhatsApp" ou "Your Instinct lives on WhatsApp.", com um QR code e "Start texting Instinct". A configuração `iMessageFirstUSIOS` põe o iMessage primeiro para quem está nos EUA com iOS ([OnboardingPage](https://app.instinct.com/assets/OnboardingPage-tQE3TyJa.js)).
6. Opcional: o app de Mac ("Connect Instinct to your Mac", [DownloadPage](https://app.instinct.com/assets/DownloadPage-CZH9jDnk.js)), que habilita o "iMessage local" e o navegador local ([WorkspacePage](https://app.instinct.com/assets/WorkspacePage-CnziGKDx.js)).
- FATO: quem não é aprovado vê "If you think this is a mistake, reach out at comms@instinct.com." ([NotApprovedPage](https://app.instinct.com/assets/NotApprovedPage-BC_wxo_8.js)).

### 3. Ações por mensagem, integrações e tarefas longas

- FATO, exemplos de pedidos que o fundador publicou:
  - **Grupos:** planejar viagem com amigos, comprar ingressos na abertura e dividir o custo, cuidar da liga de fantasy, montar a escala de carona, organizar o Thanksgiving ([X, 10-05](https://x.com/noahrshinn/status/2107161132192690558)).
  - **E-mail:** "forward an order confirmation and ask Instinct to arrange a return. It can contact support, provide the order details, ask whether you'd prefer a refund or replacement, and bring you the return label". Também colher disponibilidades num thread e resumir cadeias longas ([X, 09-08](https://x.com/noahrshinn/status/2097443135177798060)).
  - **Localização:** "remind you to pick up your package when you get home", "Where did I park?" ([X, 09-05](https://x.com/noahrshinn/status/2096307855372734963)).
- FATO, integrações vistas no código ([WorkspacePage](https://app.instinct.com/assets/WorkspacePage-CnziGKDx.js), [ConnectPage](https://app.instinct.com/assets/ConnectPage-Dy4YHZ0E.js), [bundle](https://app.instinct.com/assets/app-C-Jgxgav.js)):
  - Google Workspace (Calendar, Tasks, Drive, Sheets, Slides), Outlook, Linear, Notion, Granola, Slack, Whoop, Spotify, Shop e Stripe Link;
  - iMessage local pelo Mac e navegador local;
  - um cofre (Vault) de senhas e dados, com "sites" autorizados.
- FATO: a política nomeia o Google Workspace (Calendar, Gmail, Drive, Docs, Sheets, Slides, Tasks) ([Privacidade](https://instinct.com/privacy-policy)). O pagamento usa cartões do Stripe Link ([X, 08-28](https://x.com/noahrshinn/status/2093368510449877180)), e o checkout de hotel e voo usa componentes do Stripe e do Duffel ([HotelCheckoutPage](https://app.instinct.com/assets/HotelCheckoutPage-K87hU08v.js)).
- FATO: a conexão de integração é **por link enviado pelo agente**. As mensagens de erro são "This page is only accessible from a link sent by Instinct.", "It may have already been used or expired. Ask the agent for a new one." e "The link is bound to a different integration than the URL." ([ConnectPage](https://app.instinct.com/assets/ConnectPage-Dy4YHZ0E.js)).
- FATO, tarefas longas:
  - "Instinct handles the back-and-forth and checks in when it needs your input." ([X, 09-08](https://x.com/noahrshinn/status/2097443135177798060));
  - gatilhos de localização deixam o agente "follow up when the task becomes relevant" ([X, 09-05](https://x.com/noahrshinn/status/2096307855372734963));
  - depois de uma aprovação no Vault, a tela diz "Your agent will pick up where it left off." ([VaultApprovalPage](https://app.instinct.com/assets/VaultApprovalPage-Cig5KP1J.js)).
- FATO: Instincts conversam entre si (rede Instinct-to-Instinct). São "300k+" coordenações na primeira semana, com troca de arquivos cifrada de ponta a ponta, e cada conexão "still requires explicit approval on your end" ([X, 09-23](https://x.com/noahrshinn/status/2102896414514688212)).
- INFERÊNCIA: o agente roda de forma assíncrona e **puxa a conversa** quando termina ou quando precisa de algo. A mensagem proativa no WhatsApp esbarraria na janela de 24h (seção 6), o que sugere que o iMessage é o canal preferido nos EUA.

### 4. Confirmação de ações perigosas ou irreversíveis

- FATO, pelos Termos ([Termos](https://instinct.com/terms)):
  - a empresa "may implement safeguards, confirmation requirements, or other controls on certain Actions", sem garantia de que isso evite erros;
  - "Actions may not always be reversible";
  - "Records of Actions [...] may not always be accurate";
  - o usuário nomeia o serviço "as your agent" para aceitar acordos em seu nome.
- FATO, o padrão que aparece no código é **link para a web app com login**, nunca uma aprovação dentro do chat:
  - **Vault:** a tela pergunta "Copy your … to your agent's computer?", "Enter your SSN on a new site?" ou "Use "…" on a new site?", com os botões permitir, "Always allow" e recusar ("Your agent will find another way."). A consulta traz `returnSmsPhoneNumber`, para devolver a pessoa ao chat ([VaultApprovalPage](https://app.instinct.com/assets/VaultApprovalPage-Cig5KP1J.js));
  - **Grupos:** "Yes, trust this group" e "Remove trust", com `returnSmsPhoneNumber` e `returnWhatsAppPhoneNumber` ([GroupTrustPage](https://app.instinct.com/assets/GroupTrustPage-Bcw6vZxP.js));
  - **Compras de hotel e voo:** checkout na web, com as regras de cancelamento e reembolso à vista ([HotelCheckoutPage](https://app.instinct.com/assets/HotelCheckoutPage-K87hU08v.js));
  - **Integrações:** link de uso único, preso à integração ([ConnectPage](https://app.instinct.com/assets/ConnectPage-Dy4YHZ0E.js)).
- FATO, nos grupos: "Your personal Instinct asks before connecting with the group's Instinct", "Your Instinct checks your permissions before sharing information or taking action" e "If someone new joins the group, all pending replies from your Instinct are held until you grant it permission" ([X, 10-05](https://x.com/noahrshinn/status/2107161132192690558)).
- INFERÊNCIA: confirmações leves, como "prefere reembolso ou troca?", são pergunta e resposta no próprio chat. O que envolve segredo, dinheiro ou confiança vai para um link autenticado, de uso único e ligado à conta. Não achei fonte primária de um "responda SIM para confirmar".

### 5. Provedor por trás de WhatsApp, SMS e e-mail

- FATO: a política e os Termos **não nomeiam** Twilio, Meta, Sendblue nem outro provedor de mensagens. Citam apenas o Google, um processador de pagamento sem nome e "Third-party AI model providers" ([Privacidade](https://instinct.com/privacy-policy), [Termos](https://instinct.com/terms)).
- FATO: o bundle não contém nenhuma das strings `twilio`, `sendblue`, `linq`, `loopmessage`, `telnyx`, `vonage`, `plivo`, `bandwidth` ou `bluebubbles` (busca minha no [bundle](https://app.instinct.com/assets/app-C-Jgxgav.js)).
- FATO: o OTP pode chegar "in WhatsApp" numa conversa **separada** ("Look for a separate Instinct chat in WhatsApp") e existe o campo `canSendWhatsApp` ([AuthFlow](https://app.instinct.com/assets/AuthFlow-CkDa3VD1.js), [bundle](https://app.instinct.com/assets/app-C-Jgxgav.js)).
- FATO: o iMessage existe em dois modos: o número do Instinct e o "iMessage local" pelo app de Mac do usuário ([WorkspacePage](https://app.instinct.com/assets/WorkspacePage-CnziGKDx.js)).
- INFERÊNCIA:
  - um remetente de OTP separado no WhatsApp é o padrão dos templates de autenticação da WhatsApp Business Platform. Isso sugere API oficial (Cloud API ou um BSP), mas não prova;
  - o SMS para OTP com STOP, HELP e START é típico de um provedor A2P dos EUA (como Twilio), mas nenhuma fonte primária confirma;
  - o provedor fica escondido porque **o usuário só vê o nome "Instinct"** (nome de exibição e contato salvo pelo QR ou pelo `wa.me`) e números entregues pela própria API do Instinct.

### 6. Preços, limites, países e restrições

- **Preço:**
  - FATO: não há página de preços. Os Termos preveem recursos pagos em dólar, cobrança por cartão ou PayPal, pagamentos "non-refundable" e preço que pode mudar ([Termos](https://instinct.com/terms));
  - FATO: o fundador fala só em beta por convite ([X, 08-26](https://x.com/noahrshinn/status/2092691344456351744));
  - INFERÊNCIA: hoje é gratuito no beta, mas só fontes secundárias dizem isso.
- **Países:**
  - FATO: "US phone numbers only." no convite ([InvitePage](https://app.instinct.com/assets/InvitePage-CimL2aoJ.js)), a validação "Enter a US phone number, like (415) 555-0142." e as consultas `smsSignupUsOnly`, `smsSignupAllowedCountries` e `smsSignupCountryGuess` ([useSmsSignupUsOnly](https://app.instinct.com/assets/useSmsSignupUsOnly-C5S4LhFu.js), [bundle](https://app.instinct.com/assets/app-C-Jgxgav.js));
  - FATO: a ligação do WhatsApp aceita número de outro país ("even if you use a different phone number there");
  - FATO: o serviço é operado dos EUA e há a restrição de exportação de praxe ([Termos](https://instinct.com/terms));
  - INFERÊNCIA: o SMS fica nos EUA e o WhatsApp é a porta para fora deles. As listas de países por configuração indicam que eles abrem país a país.
- **Limites:**
  - FATO: a capacidade de computação limita os convites ([X, 08-26](https://x.com/noahrshinn/status/2092691344456351744));
  - FATO: houve lentidão por excesso de uso ([X, 08-30](https://x.com/noahrshinn/status/2093905019108213059));
  - FATO: 10 convites por pessoa ([InvitePage](https://app.instinct.com/assets/InvitePage-CimL2aoJ.js)) e 3 trocas de e-mail por dia ([WorkspacePage](https://app.instinct.com/assets/WorkspacePage-CnziGKDx.js)).
- **SMS:** FATO: "Message frequency varies; typically one message per sign-in request", STOP, START e HELP, "Message and data rates may apply" ([Termos](https://instinct.com/terms)).
- **Janela de 24h e templates:**
  - FATO (Meta, válido para qualquer empresa na API oficial): mensagem livre só "within an open customer service window", que abre quando o usuário escreve e dura 24 h. Fora dela, só template, nas categorias autenticação, marketing ou utilidade, com revisão "can take up to 24 hours" ([preços da Meta](https://developers.facebook.com/docs/whatsapp/pricing), [templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview));
  - FATO: a cláusula 4.7 dos termos da plataforma proíbe provedores de IA quando a IA é a funcionalidade principal, a critério da Meta, com exceção para "determinados países" ([Termos Meta WhatsApp Business, atualizado em 2026-09-23](https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform));
  - INFERÊNCIA: o Instinct, um assistente de uso geral, precisaria de um acordo com a Meta ou se apoiar na exceção por país para usar a API oficial. Não achei fonte primária de como eles resolvem isso.

### 7. Padrões de UX nas conversas

- FATO: o fundador vende a ausência de interface: "there are no new interfaces" ([X, 08-26](https://x.com/noahrshinn/status/2092691344456351744)). O investidor fala no cuidado com "how Instinct thinks about and talks to you" ([X, Pranav Reddy](https://x.com/pranavreddy/status/2092710913329770808)).
- FATO, nos grupos:
  - "A new Instinct joins and works for the whole group"; os amigos não precisam ter conta;
  - o Instinct do grupo não tem acesso às contas pessoais de ninguém;
  - as respostas ficam retidas quando entra alguém novo ([X, 10-05](https://x.com/noahrshinn/status/2107161132192690558)).
- FATO, mídia:
  - troca de PDFs, imagens e planilhas entre Instincts ([X, 09-23](https://x.com/noahrshinn/status/2102896414514688212));
  - localização compartilhada no iMessage ([X, 09-05](https://x.com/noahrshinn/status/2096307855372734963));
  - a política prevê "audio and voice data" quando habilitado ([Privacidade](https://instinct.com/privacy-policy));
  - no código há "voice calls", "voice shortcut" e uma tela de Voice Lab ([bundle](https://app.instinct.com/assets/app-C-Jgxgav.js));
  - cada anúncio do fundador vem com um vídeo vertical de demonstração (1080x1920) nos posts citados.
- FATO: o feedback é pedido por mensagem: "Ask Instinct to send feedback to the team at any time", e o link de convite também: "Ask Instinct at any time for your private invite link" ([InvitePage](https://app.instinct.com/assets/InvitePage-CimL2aoJ.js)). O próprio agente gerencia a conta ("To join early access [...] ask your Instinct to put you on the list", [X, 10-05](https://x.com/noahrshinn/status/2107161132192690558)).
- INFERÊNCIA: tom casual e curto, a conversa como único lugar de comando (configurações também se pedem por mensagem) e a web só para o que não cabe no chat (formulários, segredos, pagamento, confiança).

## Lacunas: o que não deu para confirmar

- O provedor de SMS, iMessage e WhatsApp: nenhuma fonte primária nomeia.
- Se o WhatsApp usa a API oficial da Meta e como o Instinct convive com a cláusula 4.7.
- Se o número é um só para todos, de um pool ou um por usuário. Há sinais de que varia por usuário e muda, mas nada definitivo.
- O formato real das mensagens: tamanho, uso de botões ou listas do WhatsApp, áudio de entrada transcrito ou não. Os vídeos oficiais não foram assistidos quadro a quadro.
- O preço depois do beta e a lista de países do WhatsApp (`smsSignupAllowedCountries` vem do servidor).
- Se os grupos funcionam no WhatsApp ou só no iMessage. O campo `returnWhatsAppPhoneNumber` na tela de grupo sugere que sim, mas não confirma.
- Se existe confirmação do tipo "responda SIM" no chat. Nenhuma fonte primária mostra.
- A página de imprensa (BusinessWire) recusou o acesso (403). A rodada e a avaliação não entram como fato aqui.
- O X recusou o acesso direto (402). Os textos dos posts foram lidos pelo espelho público `api.fxtwitter.com`, que devolve o texto original do post. As URLs citadas são as do X.

## Aplicação na Althius

Contexto: a Althius quer Canais WhatsApp, E-mail e SMS próprios, onde se fala com um Agente e se orquestra trabalho. O primeiro uso é interno (o time como prestador: GTM com clientes, enriquecimento, não deixar escapar nada). O cliente final nunca vê o provedor. Pelo `CONTEXT.md`, um **Canal** é "uma Conexão onde se conversa com um Agente" e é **distinto** do **Canal de abordagem** (o meio de um passo da Sequência até um Contato) e da **Conta remetente** (identidade pessoal do vendedor, "_Avoid_: WhatsApp do Workspace, conta compartilhada"). Um número de WhatsApp da Althius para falar com Agentes é um Canal, não uma Conta remetente, e não deve reaproveitar `private.sender_accounts`.

### Comparação com o molde do Canal Slack (`.scratch/slack-canal/spec.md`)

**O que se copia quase igual:**
- **Um bot e um número da Althius, com o Agente mencionado.** O Slack exige `@Scopus` no texto (ADR-0004). No WhatsApp ou SMS vale a mesma regra de Menção (`reconhecerMencoes`) e a mesma lista de canais da Personalização ("whatsapp", "sms", "email").
- **Identidade nunca cria Conta.** O "não reconhecido" vira resposta curta, sem Execução nem Crédito (US 32–35). O Instinct faz o mesmo ao mandar o desconhecido para o cadastro. A Althius não deve cadastrar: Acesso é por contrato e por convite.
- **Execução com gatilho `canal`, RPC só do service role e idempotência pelo id da mensagem** (`wamid` da Meta, `MessageSid` da Twilio) como `client_request_id`. Continua valendo o "ocupado / ainda respondendo".
- **Webhook sem JWT, autenticado por assinatura** (`X-Hub-Signature-256` da Meta, `X-Twilio-Signature` da Twilio), com resposta 200 rápida e processamento depois, como na Unipile e no Stripe.
- **Entrega por gatilho no banco (`pg_net`) quando a Execução termina**, com a falha clara e sem resposta inventada, e "Aprovação aguardando na fila" quando houver uma.
- **A Conversa aparece na Althius só para leitura**, com a origem WhatsApp, SMS ou E-mail, e o composer desabilitado.
- **Só texto na primeira fatia** (US 43–44). Áudio é muito comum no WhatsApp no Brasil. Sem ele, o aviso "só leio texto" precisa ser bom.

**O que muda:**
- **Identidade.**
  - O Slack reconhece pelo e-mail verificado do Slack. No WhatsApp e no SMS o único dado é o **telefone**, e a Conta de usuário da Althius hoje não tem telefone verificado.
  - É preciso um **vínculo explícito**, como no Instinct: na Althius, a pessoa informa o número e recebe um OTP por WhatsApp ou SMS (template de autenticação). Isso grava "telefone verificado → Conta de usuário".
  - No E-mail, o remetente (`From`) é fácil de forjar. Ou se exige SPF, DKIM e DMARC alinhados, ou só se aceitam respostas a um endereço único por Conversa.
- **Workspace.**
  - O Slack fixa um `team_id` por Workspace, e o Administrador instala.
  - Um **número da Althius só para todos** não traz o Workspace dentro da mensagem. Se a pessoa tem Participação em vários Workspaces (o time da Althius como prestador terá vários clientes), é preciso escolher: um Workspace padrão por vínculo, um comando para trocar ou um número por Workspace.
- **Fio.**
  - O WhatsApp e o SMS **não têm thread**. Cada pessoa tem um chat só com o número. O "um thread, um dono, um Agente" do Slack vira "uma Conversa ativa por pessoa e Canal".
  - Abrir outra exige uma regra: um comando como o `/new` do Instinct, uma nova menção a outro Agente, ou um tempo de inatividade.
  - O "responder citando" do WhatsApp (`context.message_id`) pode servir de fio parcial.
- **Mensagem proativa.**
  - O Slack posta quando quer. No WhatsApp oficial, **fora das 24h desde a última mensagem da pessoa**, a entrega de uma Execução longa, de um Aviso do Workspace ou de uma Aprovação pedida só sai por **template aprovado** (utilidade, pago fora da janela).
  - Uma Execução longa que termina depois de 24h precisa de template ("Seu pedido ao @Scopus terminou. Responda para ver.").
- **Aprovação.**
  - O Slack deixou a Aprovação só na fila.
  - O Instinct mostra o caminho natural para o celular: **link autenticado e de uso único para a Aprovação na Althius**, com volta para o chat, no estilo `returnSmsPhoneNumber`.
  - Botões interativos do WhatsApp para aprovar são possíveis, mas criam uma segunda via de decisão. A regra do `CONTEXT.md` de que só Administradores decidem as Aprovações de ação no Workspace operacional precisa valer ali também.
- **Retirar o Canal.** O Administrador não instala nada. Ou o Canal é da plataforma e se liga por Workspace (lista de canais da Personalização), ou é um número por Workspace.

### Unipile (WhatsApp comum por QR) versus API oficial da Meta e Twilio para SMS

| | Unipile (QR num WhatsApp comum) | API oficial do WhatsApp Business (Meta Cloud API ou BSP) | Twilio SMS (Brasil) |
|---|---|---|---|
| Base | Autentica "an existing WhatsApp account through a QR code or a pairing code", sem WABA nem verificação da Meta ([Unipile](https://www.unipile.com/whatsapp-api-providers/)) | Número sob uma WABA da empresa, cobrança por mensagem pela Meta ([Unipile, descrição da Cloud API](https://www.unipile.com/whatsapp-api-providers/); [Meta](https://developers.facebook.com/docs/whatsapp/pricing)) | Número alugado da Twilio |
| Risco de banimento e termos | **Alto para este uso.** Os Termos do WhatsApp proíbem "bulk messaging, auto-messaging", "any non-personal use [...] unless otherwise authorized" e acesso "through automated or other means" ([WhatsApp ToS](https://www.whatsapp.com/legal/terms-of-service)). A Unipile diz que está dentro dos termos, mas é a posição dela; a página só fala de bloqueio para bibliotecas de engenharia reversa ([Unipile](https://www.unipile.com/whatsapp-api-providers/)). INFERÊNCIA: um número que responde automaticamente a muita gente com um agente é exatamente o padrão que a Meta pune. | Baixo quanto ao canal, com regras de qualidade (template pausado por "recurring negative feedback", [Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview)). **Risco regulatório:** a cláusula 4.7 proíbe provedores de IA quando a IA é a funcionalidade principal ([Termos Meta](https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform)). INFERÊNCIA: um "agente da Althius por WhatsApp" para o time interno e os clientes pode ser lido como IA principal. É preciso enquadrar como atendimento e operação do próprio negócio, ou checar a exceção por país. | Baixo. Sem o "banimento" do WhatsApp, mas com as regras das operadoras. Marketing é proibido fora de 09h–22h e aos domingos; o código longo nacional é só P2P ([Twilio BR](https://www.twilio.com/en-us/guidelines/br/sms)). |
| Custo | Assinatura Unipile por conta conectada (não pesquisei o valor; lacuna) | Mensagem livre dentro da janela de 24h é grátis, e template de utilidade dentro dela também. Fora da janela, paga por template (tabela em BRL desde 2026-07-01) ([Meta](https://developers.facebook.com/docs/whatsapp/pricing)) | US$ 0,0599 por segmento para o Brasil e número internacional a US$ 1,15/mês ([Twilio preços BR](https://www.twilio.com/en-us/sms/pricing/br)) |
| Janela de 24h e templates | Não se aplicam ("no WABA and no template requirement", [Unipile](https://www.unipile.com/whatsapp-api-providers/)) | Aplicam-se. Fora das 24h, só template, com revisão de até 24h ([Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview)) | Não há janela. Há consentimento e STOP/HELP no idioma local, como recomendação ([Twilio BR](https://www.twilio.com/en-us/guidelines/br/sms)) |
| Esconder o provedor | O cliente vê um WhatsApp comum com o nome que a Althius puser, sem selo | O cliente vê o nome de exibição da Althius (aprovado pela Meta), e o provedor não aparece | Com um número internacional, o remetente **não é preservado** e pode virar "a random short code or long code" ([Twilio BR](https://www.twilio.com/en-us/guidelines/br/sms)). Isso é ruim para conversa bidirecional. O código longo nacional preserva, mas é P2P, e o short code leva 2–4 semanas. |
| Tempo até ir ao ar | Horas: a Althius já tem o adaptador, o webhook e o wizard (ADR-0015, ADR-0024) | INFERÊNCIA: dias a semanas (Meta Business verificado, número, nome de exibição, templates de autenticação e utilidade aprovados) | Horas para testar com número internacional. Semanas para short code ou sender ID registrado (~10 semanas) ([Twilio BR](https://www.twilio.com/en-us/guidelines/br/sms)) |
| Encaixe com o repo | A Unipile é **descartável** e trocada a cada teste de 7 dias (ADR-0015, ADR-0024). Um Canal com número fixo cairia a cada troca: quebra o requisito de não deixar escapar nada. | Provedor novo, com segredos próprios no Vault, no padrão das Integrações | Provedor novo, com segredos próprios |

**Leitura (INFERÊNCIA):**
1. A Unipile serve para um **protótipo interno de dias**, com um número de teste descartável, e não para o Canal de verdade. Pesam contra ela o risco nos termos, o vínculo com a conta Unipile descartável e a confusão de conceitos com a Conta remetente.
2. A API oficial é o caminho do Canal WhatsApp. O desenho precisa nascer com template de autenticação (OTP de vínculo) e template de utilidade ("sua Execução terminou", "há uma Aprovação esperando"), e com o enquadramento da cláusula 4.7 resolvido antes.
3. SMS no Brasil é caro e frágil para conversa bidirecional. Talvez caiba só como **OTP e aviso**, não como Canal de conversa.
4. **Enriquecimento de dados por SMS e WhatsApp** com contatos de clientes **não é Canal**. É falar com terceiros, ou seja, Canal de abordagem e Conta remetente, com as regras de Destino confirmado e Aprovação. Misturar os dois é o maior risco de modelagem.

### Perguntas abertas para o grilling

1. Quem escreve para o número: só o time da Althius (Participações) ou também pessoas dos clientes? E Contatos (terceiros) podem escrever? Se sim, isso é Canal ou caixa de entrada de abordagem?
2. "Enriquecimento de dados por SMS e WhatsApp" quer dizer o Agente perguntar coisas a Contatos? Nesse caso é Canal de abordagem, com Conta remetente e Aprovação, e fica fora deste Canal?
3. Um número só da Althius para todos os Workspaces, ou um número por Workspace? Com um só, como a pessoa com Participação em vários Workspaces escolhe onde está falando?
4. O vínculo do telefone: OTP feito na Althius (tela de perfil) ou iniciado pelo próprio WhatsApp ("mande o código que aparece na Althius")? O telefone vira um atributo verificado da Conta de usuário?
5. Fio sem thread: o que abre uma nova Conversa? Comando, menção a outro Agente, inatividade de N horas? Vale "um Agente por fio" como no Slack, ou a Coordenação entra aqui?
6. Execuções longas e a janela de 24h: aceitamos pagar template de utilidade para avisar que terminou? Qual o texto, e quem aprova os templates na Meta (Passos do Nan)?
7. Aprovação pelo celular: link autenticado e de uso único para a fila da Althius (padrão Instinct), botões do WhatsApp, ou nada além do aviso? E como fica a regra de que só Administradores decidem as Aprovações de ação?
8. Áudio: transcrever na primeira fatia ou recusar com "só leio texto"? No Brasil, recusar áudio pode matar a adoção.
9. Cláusula 4.7 da Meta: como enquadramos o Agente da Althius ("operação do próprio negócio" versus "IA de uso geral")? Alguém consulta o BSP ou a Meta antes de construir?
10. BSP ou Cloud API direta? Um BSP (inclusive a própria Twilio para WhatsApp) junta WhatsApp e SMS num provedor só. A Cloud API direta é mais barata e tem uma camada a menos.
11. E-mail como Canal: um endereço por Agente, por Workspace ou por Conversa? Que provedor de entrada, e como autenticar o remetente?
12. Protótipo com Unipile: aceitamos um número descartável só para validar a UX com o time por algumas semanas, sabendo que ele cai a cada troca de conta Unipile e pode ser banido?
13. SMS: é Canal de conversa ou só OTP e aviso? Vale o custo de um número brasileiro de verdade (short code ou código longo nacional)?
14. O cliente final não ver o provedor: basta o nome de exibição verificado "Althius", ou cada cliente quer o próprio nome (número por cliente)?

## Fontes

Primárias do Instinct:
- https://instinct.com
- https://instinct.com/terms
- https://instinct.com/privacy-policy
- https://app.instinct.com/login
- https://mail.instinct.com
- https://app.instinct.com/assets/app-C-Jgxgav.js
- https://app.instinct.com/assets/AuthFlow-CkDa3VD1.js
- https://app.instinct.com/assets/OnboardingPage-tQE3TyJa.js
- https://app.instinct.com/assets/InvitePage-CimL2aoJ.js
- https://app.instinct.com/assets/TextInstinctPage-D4b_jKoS.js
- https://app.instinct.com/assets/TextMigrationPage-DcTTHk4G.js
- https://app.instinct.com/assets/TextOnboardingPage-D7MUOQ8T.js
- https://app.instinct.com/assets/useSmsSignupUsOnly-C5S4LhFu.js
- https://app.instinct.com/assets/LinkIcloudPage-CIw8SBaf.js
- https://app.instinct.com/assets/ActionLinkAccess-BfVY2h7A.js
- https://app.instinct.com/assets/VaultApprovalPage-Cig5KP1J.js
- https://app.instinct.com/assets/GroupTrustPage-Bcw6vZxP.js
- https://app.instinct.com/assets/ConnectPage-Dy4YHZ0E.js
- https://app.instinct.com/assets/WorkspacePage-CnziGKDx.js
- https://app.instinct.com/assets/HotelCheckoutPage-K87hU08v.js
- https://app.instinct.com/assets/DownloadPage-CZH9jDnk.js
- https://app.instinct.com/assets/NotApprovedPage-BC_wxo_8.js
- https://x.com/noahrshinn/status/2092691344456351744 (lançamento, 2026-08-26)
- https://x.com/noahrshinn/status/2093368510449877180 (Stripe, 2026-08-28)
- https://x.com/noahrshinn/status/2093905019108213059 (lentidão, 2026-08-30)
- https://x.com/noahrshinn/status/2096307855372734963 (localização, 2026-09-05)
- https://x.com/noahrshinn/status/2097443132816396649 e https://x.com/noahrshinn/status/2097443135177798060 (e-mail próprio, 2026-09-08)
- https://x.com/noahrshinn/status/2100262985491231101 (Concierge, 2026-09-16)
- https://x.com/noahrshinn/status/2102896414514688212 (rede Instinct-to-Instinct, 2026-09-23)
- https://x.com/noahrshinn/status/2107161132192690558 (grupos, 2026-10-05)
- https://x.com/noahrshinn/status/2107875073038385546 (atendimento com Sierra e Decagon, 2026-10-07)
- https://x.com/pranavreddy/status/2092710913329770808 (investidor, Conviction, 2026-08-26)

Primárias de provedores:
- https://developers.facebook.com/docs/whatsapp/pricing
- https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview
- https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform
- https://www.whatsapp.com/legal/terms-of-service
- https://www.unipile.com/whatsapp-api-providers/
- https://www.twilio.com/en-us/sms/pricing/br
- https://www.twilio.com/en-us/guidelines/br/sms

Contexto interno lido: `CONTEXT.md` (Conexões e permissões; Canal de abordagem e Conta remetente), `.scratch/slack-canal/spec.md`, `docs/adr/0015-conta-unipile-descartavel-durante-a-pre-producao.md`, `docs/adr/0024-contratos-v1-e-v2-da-unipile-e-troca-de-conta-sem-perder-historico.md` e `supabase/functions/README.md`.

Fontes secundárias usadas só para achar pistas, nunca como base de afirmação: TechCrunch, eesel.ai, mager.co e coberturas da rodada.
