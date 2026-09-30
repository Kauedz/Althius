# 07: Aviso de Sinais em breve no catálogo

**What to build:** o catálogo de Sinais mostra, em cada card, o estado real: Disponível, Em teste ou Em breve, e um aviso claro no topo de que novos Sinais entram ao passar no teste (Gupy, Google Ads, notícias, tecnologia do site, rodadas, Reclame Aqui e os Sinais próprios).

**Blocked by:** 01: Registro de actors.

**Status:** ready-for-agent

## Pode mexer

- As páginas de Sinais e a Fonte de Sinais real, lendo o estado do registro de actors.

## Não mexa

- Nos tickets CRM-10 e CRM-11 da outra sessão sem combinar: esta spec é o detalhamento do CRM-11; quem pegar um ticket daqui avisa o Nan.
- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [x] Card "Em breve" não deixa criar Monitoramento e diz o motivo.
- [x] Aviso no topo do catálogo.
- [x] A Demonstração continua mostrando o catálogo completo.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- O estado vem do registro de actors (`tipos()` da Fonte real devolve `disponibilidade`): Disponível (o actor passou no teste), Em teste ou Em breve (o tipo do catálogo ainda não tem Sinal real).
- Card em teste ou em breve mostra o selo e o motivo e **não é link**; a página do tipo não oferece "Novo monitoramento" e diz o motivo; o endereço direto do formulário volta para a página do tipo.
- Aviso no topo do catálogo (`role="note"`) com os Sinais que faltam (Gupy, Google Ads, notícias, tecnologia do site, rodadas de investimento, Reclame Aqui e os Sinais próprios); só aparece quando algum tipo não está disponível. A Demonstração não informa estado e segue mostrando o catálogo completo, sem selos nem aviso.
- Aparece no Workspace operacional quando o módulo Sinais for liberado (ticket 03); os testes usam uma Fonte com estados.
