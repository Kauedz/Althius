---
status: proposed
supersedes: 0026
---

# Canal WhatsApp com controle total

Quem tem Participação controla a Althius inteira pelo **WhatsApp**, num **número único da Althius** com nome de exibição verificado "Althius", pela **Cloud API oficial da Meta, direta, sem BSP nem serviço pago**. Não há outro Canal de mensagem nesta decisão: nem iMessage, nem SMS.

O chat faz **tudo o que a tela faz e nada além disso**:
- toda ferramenta chama a **mesma RPC da tela**, em nome da Conta de usuário reconhecida pelo **Telefone verificado**;
- para isso, a Edge Function emite um **JWT curto (60 s) do usuário** (`role=authenticated`, claim `canal=whatsapp`), e assim valem a RLS, o papel, a Permissão, o contrato (ADR-0025) e os Créditos;
- o risco de cada ferramenta é decidido **pelo código**, nunca pelo modelo.

## Status `proposed`

A cláusula 4.7 dos termos da WhatsApp Business Platform proíbe provedores cuja funcionalidade principal é a IA, a critério da Meta. Este ADR só vira `accepted` com uma **resposta escrita da Meta** enquadrando o Canal como operação do próprio produto. Até lá, tudo é construído contra um simulador.

## Decisão

- **Número e API:**
  - um número só para todos os Workspaces, pela Cloud API direta;
  - webhook com `X-Hub-Signature-256`;
  - o Workspace é escolhido depois (o último usado, com uma lista numerada quando há dúvida).
- **Identidade:**
  - Telefone verificado em Meu perfil, com código de 6 dígitos pelo **template de autenticação** do WhatsApp;
  - **não há reserva por SMS**: se o WhatsApp não entregar, a pessoa tenta de novo.
- **Confirmação:**
  - leitura: responde direto;
  - reversível: **botões interativos** Aprovar/Recusar (ou "SIM" digitado), com token de uso único ligado ao hash do conteúdo, à Conta e ao Workspace, válido por 10 min;
  - irreversível ou sensível (mandar mensagem a lead, ativar Sequência, apagar, mudar papel, remover Participação, mexer em Integração): o botão ou o "SIM" só vale se a Conta **fez login na Althius nas últimas 12 h**; senão, sai um **link de uso único com login**;
  - conectar Integração é sempre por link OAuth, e uma chave de API nunca entra pelo chat.
- **Caixa de leads:** a leitura continua pela Unipile (Contas remetentes). O número da Althius nunca fala com Contatos.
- **Janela de 24h:**
  - dentro dela, as respostas são mensagens de serviço (texto e botões);
  - fora dela, só sai **template aprovado e sem conteúdo** ("seu pedido no *Acme* terminou", "há uma aprovação esperando você"), e o resultado e os botões chegam quando a pessoa responde.
- **Avisos proativos:** opt-in por tipo, das 09h às 21h, no máximo 10 por dia, agrupados. Fora da janela, viram template de utilidade.
- **Custo:** fica com a Althius e não vira Crédito. O cliente só vê Créditos. O Canal deve caber na faixa grátis (detalhes abaixo).

## Custos (Meta, Brasil, tabela de 01/10/2026)

| Item | Preço | Fonte |
|---|---|---|
| Mensagem recebida da pessoa | grátis | [Meta FAQ](https://whatsappbusiness.com/resources/faq/) |
| Resposta de serviço na janela de 24h (texto e botões) | **1.000 grátis por mês e por número**; depois, **R$ 0,035** cada | [Meta FAQ](https://whatsappbusiness.com/resources/faq/), [WABA Index](https://wabaindex.com/learn/whatsapp-api-pricing-brazil) |
| **Template de autenticação** (código do Telefone verificado) | **R$ 0,035 por entrega, sempre cobrado** | [WABA Index](https://wabaindex.com/learn/whatsapp-api-pricing-brazil) |
| **Template de utilidade** (avisos fora da janela; desde 01/10/2026, também dentro dela) | **R$ 0,035 por entrega** | idem |
| Marketing | R$ 0,3217, **não usado** | idem |

**Custos diferentes de zero que precisam de atenção:**
- todo código de verificação custa R$ 0,035;
- todo aviso por template custa R$ 0,035;
- toda resposta acima de 1.000 no mês custa R$ 0,035.

Para ficar na faixa grátis:
- um contador mensal de respostas de serviço por número, com alerta à equipe em 800 e decisão humana em 1.000. Ao passar, ou se aceita pagar, ou o Canal passa a responder só com resumo e link;
- poucos códigos, porque a revalidação é feita por login e não por novo código;
- avisos agrupados e com teto, para limitar os templates;
- uma forma de pagamento cadastrada na Meta: sem ela, nada sai depois da faixa grátis.

## Considered Options

- **WhatsApp comum pela Unipile, por QR code:** descartado. Os termos proíbem uso automatizado e não pessoal, e a conta Unipile é trocada a cada fase (ADR-0015, ADR-0024).
- **BSP (Twilio, Zenvia):** descartado por agora. A Cloud API direta não tem taxa extra.
- **SMS como Canal ou como reserva do código:** descartado. Custo por segmento e remetente instável no Brasil.
- **iMessage por ponte num Mac:** descartado. Não há API oficial, o Apple ID corre risco e o Mac é um ponto único de falha.
- **Um número por Workspace:** descartado. Quem escreve são participantes, não leads.
- **Decisão só por link:** descartado para ações reversíveis e para quem fez login há pouco. O step-up de 12 h limita o risco de chip trocado.

## Consequences

- Os templates de autenticação e de utilidade precisam ser submetidos à Meta logo no início, porque a revisão leva até 24 h por template.
- O ADR-0026 fica substituído por este.
- O catálogo do motor ganha ferramentas de plataforma, cada uma com um descritor (RPC, papéis e risco).
