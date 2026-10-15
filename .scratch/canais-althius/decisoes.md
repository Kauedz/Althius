# Canal WhatsApp da Althius: decisões da fatia

Este é o mapa das decisões. A rodada 1 (Q1 a Q25) desenhou o Canal WhatsApp. A rodada 2 (D1 a D8, 15/10/2026) trocou a ordem para **SMS primeiro** e ampliou o escopo para **controle total**. A rodada 3 (R1 a R6, 15/10/2026) trocou o SMS por **WhatsApp e iMessage**. A rodada 4 (W1 a W6) define **só o WhatsApp**. Em caso de conflito, vale a mais recente. Base: [pesquisa-instinct.md](./pesquisa-instinct.md), [arquitetura-controle-total-sms.md](./arquitetura-controle-total-sms.md), [ADR-0027](../../docs/adr/0027-canal-whatsapp-com-controle-total.md) (o ADR-0026 foi substituído).

## Rodada 4: só WhatsApp (W1 a W6), substitui as escolhas de canal das rodadas 2 e 3

- **W1:** o Canal é **100% WhatsApp**, num número único "Althius", pela **Cloud API oficial direta**. Não há iMessage nem SMS, nem como reserva, e nenhum serviço pago agora (sem BSP).
- **W2:** o código do Telefone verificado sai pelo **template de autenticação** do WhatsApp, a R$ 0,035 por entrega. Não há reserva por SMS. A revalidação periódica é feita por login na Althius, sem novo código, para economizar templates.
- **W3:** as confirmações usam **botões interativos** (ou "SIM" digitado). As ações irreversíveis só valem com login nas últimas 12 h; fora disso, vai um link de uso único com login.
- **W4:** o Canal deve caber na **faixa grátis de 1.000 respostas de serviço por mês e por número**. Um contador alerta em 800 e, em 1.000, pede decisão humana. Os templates (autenticação e utilidade, R$ 0,035 cada) são o custo que sobra, e é a Althius que paga.
- **W5:** fora da janela de 24h só sai template de utilidade aprovado, sem conteúdo. Os avisos proativos seguem opt-in, das 09h às 21h, no máximo 10 por dia.
- **W6:** continua exigida a **resposta escrita da Meta sobre a cláusula 4.7**, e por isso o ADR-0027 fica `proposed`. Valem também D2 (JWT de 60 s), D3 (step-up de 12 h), D5 (custo da Althius), D7 (o chat faz tudo, com risco decidido pelo código), D8 e a leitura da caixa de leads pela Unipile.

## Rodada 3 (substituída pela rodada 4): WhatsApp e iMessage (R1 a R6), substitui D1, D4 e D6

- **R1 (substitui D1):** os Canais são o **WhatsApp** e o **iMessage**, sobre o mesmo núcleo. O SMS não é Canal e só entra, se for preciso, como reserva para o código de verificação.
- **R2 (substitui D4):** o WhatsApp vai pela Cloud API oficial da Meta. As respostas dentro da janela de 24h são mensagens de serviço, com 1.000 grátis por mês e por número desde 01/10/2026. O iMessage vai por uma **ponte num Mac dedicado da Althius** (BlueBubbles, sem Private API), com um Apple ID da Althius. Sendblue e LoopMessage ficam como reserva paga.
- **R3 (substitui D6):** as mensagens continuam curtas, com listas numeradas e o resto por link. Acentos e formatação do canal são permitidos, e a regra de GSM-7 e 160 caracteres cai.
- **R4:** quem escreve pelo iMessage é reconhecido pelo Telefone verificado ou por um e-mail de Apple ID verificado pelo mesmo código, ligado à Conta de usuário.
- **R5:** a ordem é o iMessage primeiro (não depende da Meta) e o WhatsApp quando a Meta responder sobre a cláusula 4.7. Os dois ficam atrás do simulador desde o início.
- **R6:** valem D2, D3, D5, D7 e D8 e a leitura da caixa de leads pela Unipile.

## Rodada 2: controle total (D1 a D8; os itens sobre SMS foram substituídos)

- ~~**D1:**~~ (substituída pela R1) o SMS vem primeiro e o WhatsApp depois, sobre o mesmo núcleo (o adaptador de Canal).
- **D2:** as ferramentas agem em nome da pessoa com um JWT curto do usuário (60 s, claim `canal`). As RPCs são as mesmas da tela.
- **D3:** mandar mensagem a lead e as ações de risco aceitam "SIM" no chat se a Conta fez login nas últimas 12 h. Fora disso, vai um link de uso único com login. A leitura da caixa de leads continua pela Unipile (Contas remetentes), que não é o provedor do Canal.
- ~~**D4:**~~ (substituída pela R2) o provedor de SMS é a Zenvia, a mais barata, sujeita à confirmação de vendas (número dedicado bidirecional, preço do inbound e autenticação do callback).
- **D5:** o custo do SMS fica com a Althius e não vira Crédito.
- ~~**D6:**~~ (substituída pela R3) as mensagens são curtas e sem acento (GSM-7, 160 caracteres), com no máximo 3 segmentos e o resto por link.
- **D7:** na v1, o chat faz tudo o que a tela faz. O nível de risco de cada ferramenta é decidido pelo código.
- **D8:** os avisos proativos saem só com opt-in, das 09h às 21h, com no máximo 10 por dia.

## Rodada 1: o que continua valendo

- **Q1:** só quem tem Participação usa o número. Os Contatos nunca usam esse número.
- **Q2:** o enriquecimento que fala com terceiros fica fora e continua como Canal de abordagem, pela Unipile.
- **Q6 e Q8:** o Telefone verificado é da Conta de usuário. Um número pertence a uma só pessoa. O código chega por SMS e, depois, também pelo WhatsApp. Um número desconhecido recebe "conecte seu telefone em Meu perfil", sem Crédito.
- **Q7:** o Canal usa o último Workspace. Com mais de um Workspace, pergunta com uma lista numerada. O comando "trocar de workspace" muda o Workspace, e toda Conversa começa dizendo o nome dele.
- **Q9:** uma Conversa nova abre depois de 4 horas de silêncio, com "nova conversa" ou na troca de Workspace. Ela aparece no app só para leitura.
- **Q13:** só atendem os Agentes com o canal na lista da Personalização. Os Agentes padrão vêm com o canal marcado.
- **Q18:** um número único da Althius para todos os Workspaces.
- **Q19:** o Administrador habilita o Canal em Conexões. Retirar o Canal não apaga nada.
- **Q21:** sem grupos.
- **Q14/Q24:** cada Execução gasta Créditos como no app. A transcrição, as recusas, a escolha do Workspace, os templates e o SMS não gastam.

## Rodada 1: o que mudou

- **Q4 e Q22** ("conectar Integração, Permissão e configuração só no app"): **substituídas pela D7.** Tudo passa a ser possível pelo chat. Conectar Integração continua sendo por link OAuth.
- **Q5 e Q25** ("SMS não é Canal"): **substituídas pela D1.** O SMS é Canal e aparece no catálogo.
- **Q11, Q15 e Q16** (botões): no SMS, viram "SIM" com token e step-up de 12 h (D3). No WhatsApp, viram botões com as mesmas regras.
- **Q20** (sem mensagens proativas): **substituída pela D8.**
- **Q10 e Q23** (provedor): o SMS vai pela Zenvia. O WhatsApp continua dependendo da resposta da Meta sobre a cláusula 4.7 (ADR-0026).
- **Q12** (áudio) e **Q17** (janela de 24h): só no WhatsApp, para depois.
