# Validação Canal WhatsApp/SMS vs Instinct + Slack

_Gerado em 15/10/2026, horário de Brasília. Apenas leitura: nada foi commitado, enviado com push ou aplicado._

## Veredito em 5 linhas
1. O Canal WhatsApp **segue o Instinct no que importa**: telefone verificado por OTP (WhatsApp, com SMS como reserva), conversa sem interface nova, SMS fora do papel de canal de conversa, API oficial da Meta e Unipile descartada.
2. As diferenças são **intencionais e documentadas**: número único (o Instinct, por inferência, usa um pool), aprovação por **botão no chat** (o Instinct usa link para a web) e Workspace escolhido depois da identidade.
3. **Não é "controlar o app inteiro"**: a spec deixa de fora, de forma explícita, conectar Integração, mexer em Permissão e mexer em configuração. O Instinct, por inferência, faz "configurações também se pedem por mensagem". Isso diverge do que você pediu.
4. O maior risco é externo: o ADR-0026 está `proposed` até chegar a **resposta escrita da Meta sobre a cláusula 4.7**. A spec e os tickets tratam isso direito, construindo atrás de um simulador.
5. Slack 04: a lógica está boa e bate com a issue, mas **o timestamp da migration `20261026100000` colide com `20261026100000_feedback_que_ensina.sql` em produção e no origin/main**, e as migrations 01 a 03 no main local também colidem. Não aplique nada antes de renumerar.

## WhatsApp/SMS vs Instinct

| # | Eixo | Status | Evidência |
|---|---|---|---|
| 1 | Identidade por OTP | **ALIGNED** | Instinct: "a conta é o **telefone verificado por código de uso único (OTP)**, enviado por SMS ou WhatsApp" (pesquisa-instinct.md:9). Althius: código de "6 dígitos… guardado só como hash… template de autenticação do WhatsApp, com reenvio por SMS" (spec.md:156-158); "Um número verificado é único entre todas as Contas de usuário" (spec.md:154); o "Telefone verificado" entra no glossário do CONTEXT.md (diff). A diferença é que, no Instinct, o telefone **é o login**. Na Althius, ele é um **vínculo** feito em Meu perfil numa conta que já existe. Isso faz sentido, porque o Acesso é por contrato e convite. |
| 2 | Modelo de número | **DIVERGENT (intencional, justificado)** | Instinct: "INFERÊNCIA… combina com um **pool de números**" e "Não deu para confirmar" (pesquisa:48, 157). Althius: "um número único da Althius… nome de exibição verificado 'Althius'" (ADR-0026:7). O número por Workspace foi descartado porque "Quem usa o número são participantes, não leads, então não há marca do cliente a preservar" (ADR:14). A justificativa se sustenta no B2B. O pool do Instinct é inferência e tem a ver com custo de iMessage, que não se aplica aqui. |
| 3 | Superfície do canal | **ALIGNED** | Instinct: "iMessage e WhatsApp como canais principais, SMS no login" (pesquisa:8). Althius: "O SMS não é um Canal: serve só para o código de verificação e para avisos" (ADR:21), e a Q25 tira o SMS do catálogo. Ponto em aberto: o ADR e a Q5 dizem que o SMS serve para "avisos", mas nenhum ticket manda aviso por SMS. Os avisos fora da janela saem por template do WhatsApp (issue 07). |
| 4 | Ações perigosas e aprovações | **DIVERGENT (melhoria deliberada, com ressalvas)** | Instinct: "**link para a web app com login**, nunca uma aprovação dentro do chat" (pesquisa:97). Althius: "botão interativo… O servidor confere tudo de novo no clique" (ADR:7). A opção de link foi descartada porque "Tira do chat justamente o 'pode mandar'" (ADR:15). As salvaguardas estão boas: token opaco de uso único ligado ao hash do payload e à Conta, reaproveitando `decide_approval`/`approve_reply_proposal` (spec:234-237); só o Administrador que **pediu** recebe o botão; o Membro recebe link (issue 10). Os riscos estão listados mais abaixo. |
| 5 | Escolha do Workspace | **PARTIAL (não existe no Instinct)** | O Instinct não tem multi-workspace: é um agente pessoal. A Althius usa "o último Workspace em que a pessoa falou e pergunta quando há dúvida", com lista numerada, "trocar de workspace" e o prefixo "Em *Acme*: …" (spec:16, 170-176; issue 06). É uma extensão necessária, e não uma cópia. O desenho é coerente. |
| 6 | Janela de 24h e templates | **ALIGNED** | A pesquisa recomenda template de utilidade "sua Execução terminou" e "há uma Aprovação esperando" (pesquisa:215). Spec:222 e 240 e as issues 07 e 09 cobrem isso: fora da janela, sai só o template, e o resultado e os botões ficam pendentes até a resposta da pessoa. O custo fica com a Althius. |
| 7 | Cláusula 4.7 da Meta | **ALIGNED (bem sinalizado)** | ADR:9: "Esta decisão só vira `accepted` com uma **resposta escrita da Meta**". O ticket 11 fica bloqueado pelo Passo do Nan, e o cartão de Conexões só sai de "Em breve" com o provedor configurado (issue 03; spec:305). |
| 8 | Unipile por QR rejeitada | **ALIGNED** | Pesquisa:214: "A Unipile serve para um protótipo interno de dias… não para o Canal de verdade". ADR:13 descarta pelos termos do WhatsApp e pela troca de conta (ADR-0015/0024). A Q12 da pesquisa ("Protótipo com Unipile?") não tem resposta registrada, mas o simulador cumpre esse papel. |
| 9 | Onboarding, Conexões, Meu perfil | **ALIGNED** | Issue 02 cobre o Telefone verificado em Meu perfil, com atalho `wa.me`. Issue 03 cobre o Administrador habilitando em Conexões e o WhatsApp entrando na lista dos Agentes padrão. Instinct: "Connect your WhatsApp" + `wa.me` (pesquisa:20, 44). |
| 10 | Áudio, continuidade, validação E2E | **ALIGNED** | Issue 08 cobre o áudio de até 2 minutos transcrito (a pesquisa alertava que "recusar áudio pode matar a adoção", pesquisa:228). Issue 06 cobre a virada depois de 4 horas e o comando "nova conversa". Issue 12 é a validação com o número real. O Instinct tem voz e ligações (pesquisa:148), que ficam fora daqui, o que é aceitável. |
| 11 | "Controlar e gerenciar o app inteiro" | **DIVERGENT / GAP vs o seu pedido** | Spec:18: "conectar Integração, mexer em Permissão e mexer em configuração continuam só no app". Out of Scope (spec:300-301) inclui também "Decidir no chat a Aprovação de ação pedida por outra pessoa". O motivo é que "essas ações já não existem como ferramentas" (spec:244). O que existe é: conversar com os Agentes pela Coordenação, consultar dados, atualizar Contato, ler Integrações, aprovar o que a própria pessoa pediu e disparar Execuções. Também **não há** pelo chat: criar ou editar Sequência, Rotina ou Playbook; gerenciar Participações; mexer em créditos e contrato; nem mensagens proativas (Q20). O Instinct, por inferência, trata "a conversa como único lugar de comando (configurações também se pedem por mensagem)" (pesquisa:151), mas manda para link o que envolve segredo, dinheiro ou confiança. |
| 12 | Contradições entre os documentos | **PARTIAL** | Detalhes abaixo. |

## O que está igual ao Instinct
- Telefone verificado por OTP de 6 dígitos, por WhatsApp ou SMS, com opção de reenvio por SMS ("Send SMS instead" ↔ US 11).
- O número desconhecido não é atendido. O Instinct manda para o cadastro; a Althius manda "conecte seu WhatsApp em Meu perfil" e nunca cria conta (spec:168).
- Nenhuma interface nova: a pessoa fala com o número, e um orquestrador (a Coordenação) distribui o pedido.
- O provedor fica invisível: "Os textos ao usuário nunca citam o provedor" (spec:143), como o "o usuário só vê o nome 'Instinct'" (pesquisa:114).
- API oficial, templates de autenticação e de utilidade, e o SMS restrito a OTP.
- Ações que envolvem segredos e integrações vão para a web: conectar Integração e mexer em Permissão só no app, como o ConnectPage e o Vault do Instinct.

## O que diverge de propósito (e se a justificativa se sustenta)
- **Número único em vez de pool:** se sustenta. No B2B, quem escreve são participantes, e o pool do Instinct é só inferência.
- **Botão no chat em vez de link:** se sustenta como melhoria de UX, com a nova checagem no servidor e um token preso ao hash. O próprio Instinct mantém o link só para segredo, dinheiro e confiança. Na Althius, enviar mensagem a lead e executar ação em Integração é comparável a "ação irreversível". A mitigação é mostrar o conteúdo exato e restringir quem decide.
- **Identidade como vínculo, e não como login:** se sustenta, porque o Acesso é por contrato e convite (ADR-0025).
- **Workspace escolhido depois da identidade:** é algo novo, sem equivalente no Instinct, e é necessário para o time da Althius que atende vários clientes.
- **Sem proativo nem grupos na v1:** é mais conservador que o Instinct, que puxa a conversa e tem grupos. Se sustenta por causa da janela de 24h e do custo.

## Lacunas e riscos antes de implementar
1. **"Controlar o app inteiro" não está coberto.** Se é isso que você quer, faltam ferramentas de Agente para gestão: Sequências, Rotinas, Participações e configurações. Ou então é preciso deixar escrito que a v1 é "operar pelo chat; configurar no app", com um link de uso único estilo Instinct para o resto. Hoje a spec só diz "o link para a tela certa" (é uma regra de prompt, não um link autenticado de uso único preso à ação, como o ConnectPage do Instinct).
2. **Botão e risco de conta comprometida:** quem controla o chip, por SIM swap ou celular destravado, aprova envios e ações sem login. O Instinct exige login no link. Considere step-up para Aprovação de ação, por exemplo exigindo login acima de um certo risco, ou ao menos uma revalidação periódica do Telefone verificado. Não há prazo de validade do vínculo na spec.
3. **Hoje o glossário diz "só Administradores decidem as Aprovações de ação"**, e o botão só aparece para o Administrador que pediu. A spec mesma marca isso como "Interpretação a confirmar no ticket" (spec:307). Feche antes do ticket 10.
4. **O SMS "para avisos"** (ADR:21, Q5) não tem ticket nem regra. Ou o texto sai do ADR, ou entra um critério dizendo quando o aviso vai por SMS (por exemplo, se o template falhar).
5. **A spec cita "Q11" na seção de Aprovação**, mas a pesquisa não define a autenticação do link para a fila. A spec diz "exige login normal" (spec:233) e a decisoes.md:32 diz "link autenticado". Alinhe: é login normal ou link assinado?
6. **Tempo do Passo do Nan:** a aprovação de templates e a resposta da Meta podem levar semanas. Submeta os templates já, como a Q23 manda, porque eles independem da resposta à 4.7.
7. **O ticket 04 (motor) altera o caminho do Slack.** A spec exige manter os testes do Slack verdes (spec:306). Como o Slack 04 ainda não está commitado, faça o merge do Slack primeiro, para o ticket 04 do WhatsApp partir dele.
8. **Mudança de nome no glossário:** o diff do CONTEXT.md insere "Telefone verificado" **entre** a definição de Canal e o `_Avoid_: integração` dela. Com isso, o "_Avoid_: integração" fica pendurado embaixo do Telefone verificado, que passa a ter dois `_Avoid_`. **É bug de edição**: mova o bloco para depois da linha `_Avoid_: integração`.
9. **O cartão de Conexões** mostra "Em breve" sem o provedor real (spec:305 e issue 03). Está coerente, mas o modo de desenvolvimento precisa de um guarda forte para nunca aparecer em Workspace de cliente (o critério já existe na issue 01:18).

## Slack: o que a correção faz e se está ok
**O que faz (handler.ts + index.ts):**
- Passa a tratar `message.channels`/`group` dentro de thread (`origem: 'canal'`) e lê o fio pela chave (`lerFio` → RPC `slack_channel_thread`) **antes** de reservar o evento.
- Fora de fio, a mensagem de canal sem menção ao bot é ignorada "sem ler quem escreveu". A cópia em `message.channels` de uma menção ao bot é ignorada, porque o `app_mention` já a trata.
- Dentro de fio:
  - outra pessoa recebe `fioDaConversaDe(dono)`, com a reserva sem nome quando o dono não tem nome;
  - o dono que menciona outro Agente recebe `fioDoAgente(nome)`;
  - o dono que manda só arquivo recebe "só texto";
  - o caso contrário vira `pedirExecucao(..., 'fio_continuado')` pela mesma `start_slack_channel_run` do 03, que devolve "ocupado" → "ainda respondendo".
- Refatora a abertura num helper comum (`pedirExecucao`) sem mudar o comportamento do 03.

**Bate com a issue 04?** Sim, critério por critério:

| Critério da issue 04 | Teste ou código |
|---|---|
| canal sem @ continua | teste linha 135 |
| DM continua | teste 153 |
| outra pessoa com o nome do dono | teste 173 (+186, sem e-mail) |
| outro Agente com o nome do Agente do fio | teste 193 |
| "ainda respondendo" | teste 205 |
| canal fora de fio ignorado | teste 212 |
| histórico da Conversa | vem do 03, porque o fio continua a mesma Conversa |

A migration é aditiva, `security definer`, `search_path=''`, só para o service role, e nunca devolve o e-mail. O pgTAP tem 9 asserts, inclusive o isolamento por Workspace e team_id. A issue permitia isso: "uma migration aditiva com pgTAP para ler o fio por chave".

**Pontos a olhar (nenhum é bloqueante na lógica):**
- `lerFio` roda **antes** de `reservarEvento`. Um reenvio do Slack faz uma leitura extra no banco. É inofensivo, mas vale registrar.
- Se `lerFio` lançar erro (falha no banco), não há tratamento local. Confira se o `processar` externo captura e loga a exceção. A resposta 200 já saiu, então o Slack não reenvia, e a mensagem se perde em silêncio. Isso contraria o espírito do "não é perdida em silêncio".
- Um Agente mencionado que não atende no Slack, dentro do fio, recebe "este fio é do Agente X", e não "não atende no Slack". É aceitável, porque a regra do fio vem primeiro.
- O critério "lint, `deno test`, `deno check`, pgTAP do zero verdes" **não foi verificado por mim**. Não rodei nada.
- O index.ts cita no comentário "migration 20261026100000". Atualize junto com a renumeração.
- Consistência com a spec do Slack: segue "Do evento à decisão" item 3 e a seção de eventos ("trata só as que caem num thread já mapeado como fio"). Está consistente.
- **Não validei** a "correção breve para o Slack funcionar em conectores e agentes": existe a branch `fix/canais-do-agente-slack`, mas ela não estava no escopo de arquivos pedido.

## Alerta de timestamp de migration
⚠️ **COLISÃO CONFIRMADA:**
- O arquivo novo, ainda não rastreado, é `supabase/migrations/20261026100000_leitura_do_fio_do_canal_slack.sql`.
- O `origin/main` tem **`20261026100000_feedback_que_ensina.sql`** (PR-16, já aplicada na produção Kauedz/Althius).
- **O main local também colide nas migrations do Slack:** ele tem `20261023100000_canal_slack`, `20261024100000_eventos_do_canal_slack` e `20261025100000_fio_do_canal_slack`. No origin/main, essas versões são `historico_e_sugestoes_dos_agentes`, `anexos_das_conversas` e `aprovacoes_playbook_e_guarda`.
- O commit `f77caa6` ("slack-canal: migrations depois da 20261026100000 da produção", presente no `origin/main` e no `origin/slack-canal-01-03`) já renomeou as do Slack para **20261027100000, 20261028100000 e 20261029100000**.
- O main local está `ahead 3, behind 24` e não tem esse rename.

**Ação:**
1. Não aplique nem faça push do main local.
2. Reconcilie com o origin/main, que já tem 01 a 03 renumeradas.
3. Renomeie a migration do 04 para uma versão **depois de 20261029100000**, por exemplo `20261030100000_leitura_do_fio_do_canal_slack.sql`, e atualize a referência a `20261025100000` no comentário da migration e a `20261026100000` no index.ts.
4. Antes de escolher a versão, confira no remoto se `20261030100000` está livre.

## Recomendação
- **WhatsApp/SMS: seguir, com ajustes antes dos tickets 05 e 10:**
  - (a) decida e escreva o escopo de "controlar o app": ou reduza a promessa para "operar pelo chat", ou crie tickets de ferramentas de gestão e de link de ação de uso único estilo Instinct;
  - (b) feche a regra de quem decide a Aprovação de ação (spec:307);
  - (c) defina step-up ou validade do Telefone verificado para aprovações de risco;
  - (d) alinhe o "SMS para avisos" e o "link autenticado vs login normal";
  - (e) corrija a ordem no CONTEXT.md.
  
  Os tickets 01 a 03 podem começar já. O ticket 11 só depois da resposta escrita da Meta (4.7).
- **Slack 04: a lógica está ok. Não aplique até** renumerar a migration (colisão com `feedback_que_ensina`) e reconciliar o main local com o origin/main (colisões 23/24/25). Depois disso, rode lint, `deno test`, `deno check` e pgTAP do zero.
