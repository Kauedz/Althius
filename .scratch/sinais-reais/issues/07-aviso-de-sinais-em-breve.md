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

- [ ] Card "Em breve" não deixa criar Monitoramento e diz o motivo.
- [ ] Aviso no topo do catálogo.
- [ ] A Demonstração continua mostrando o catálogo completo.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
