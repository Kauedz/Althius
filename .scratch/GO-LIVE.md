# Go-live da implementação geral (Etapas 1 a 5b)

Tudo abaixo está na `main` e com as migrations aplicadas no projeto `ycbdilsmydvzezhlymty` (md5 conferido). O que falta é passo humano, guiado pelo wizard:

```bash
# no Git Bash, na raiz do repositório
bash scripts/wizard-go-live.sh
```

## O que entrou

| Etapa | O que faz | PR |
|---|---|---|
| 1. Descoberta por ICP e enriquecimento | Busca de contas pelo ICP (Apify) com custo antes; Caixa de Descobertas; CNPJ/Receita; comitê de compra; revelar e-mail/telefone com Créditos | 135, 136, 137 |
| 2. Conectores | Cada pessoa conecta o próprio Acesso (OAuth no MCP ou chave de API): HubSpot, Notion, Apollo, Lusha, Meta Ads, Pipedrive, RD Station; ferramentas visíveis | 138 |
| 3. WhatsApp e LinkedIn | Passos de Sequência pelo WhatsApp e LinkedIn (convite com nota; mensagem se conectado); resposta pausa; canais nascem desligados | 139 |
| 4. Respostas sugeridas | O Rhetor sugere a resposta; só o titular edita, aprova e envia | 140 |
| 5a. Enviar ao CRM | Empresa, Contatos e nota com Sinais vão ao HubSpot/Pipedrive/RD; o cartão vai para No CRM | 141 |
| 5b. Agentes agindo | Ferramentas na Conversa (buscar pelo ICP, ler Contas e Sinais, consultar CRM, propor Enviar ao CRM com Aprovação) | 142 |

## Passos do Nan (o wizard cobre todos)

1. Atualizar a pasta local e publicar as Edge Functions.
2. Conferir os segredos; `APIFY_TOKEN` é o único que pode faltar.
3. Private App do HubSpot e conectar pela chave em Conexões.
4. Opcional: MCP Auth App do HubSpot (`HUBSPOT_MCP_CLIENT_ID`, `HUBSPOT_MCP_CLIENT_SECRET`).
5. Acrescentar `message.new` ao webhook da Unipile que já existe (não rodar o `wizard-unipile.sh` de novo).
6. Ligar WhatsApp e LinkedIn com `private.set_chat_channel_enabled`.
7. Reiniciar o worker do Hermes, se usar.
8. Teste final.

## Decisões abertas

- **Fila de Aprovações no Workspace operacional**: desligada (`aprovacoesDisponiveis`), porque um teste antigo do `raiz.test.tsx` exige a fila indisponível. Com Permissão Executar o Agente envia ao CRM; com Propor, a Aprovação fica pendente sem tela para decidir. Ligar exige o Nan autorizar a troca desse teste.
- **LGPD do dado coletado** (enriquecimento 05): base legal a validar com profissional de privacidade.
- **Créditos por assento** (`credits_per_seat`), Stripe em modo live e Stripe Tax: pendentes desde a Etapa de Créditos.

## Não confirmado (o primeiro uso real confirma)

- Unipile v2: nomes de campo de chat e o evento de nova relação do LinkedIn (`send-chat-step-adapters.ts`, `ingest-chat-event.ts`).
- HubSpot: escopos das notas, o tipo de associação Contact → Company, os nomes das ferramentas de escrita do MCP (por isso o Enviar ao CRM pede a chave de API).
- RD Station CRM: envelopes e o campo do id na resposta; a nota não vai (sem endpoint confirmado).
- Apify: os actors de descoberta estão como "a validar numa execução real".

## Depois do go-live

- Sincronização do HubSpot (conexoes-funcionais 04 a 06), com um portal real.
- Botão Enviar ao CRM no cartão do Kanban.
- Avaliar o Jev (TypeSafe) para classificar respostas e pontuar o ICP, e o LAYA (link a enviar).
