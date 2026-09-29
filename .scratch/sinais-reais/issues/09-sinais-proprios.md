# 09: Sinais próprios da Althius

**What to build:** actors da Althius para as lacunas brasileiras, nesta ordem: (1) CNPJ novo e nova filial, comparando as bases mensais abertas da Receita Federal; (2) Gupy por Conta-alvo; (3) monitor de anúncios ("começou" ou "parou de anunciar" na Meta, Google e LinkedIn); (4) site fora do ar ou com erro (Sinal originado); (5) Reclame Aqui; (6) alvarás e lançamentos imobiliários, começando pelas capitais-alvo. Um ticket filho por Sinal ao começar.

**Blocked by:** 02: Monitoramento real.

**Status:** needs-triage

## Pode mexer

- Actors novos num diretório próprio do repositório (a definir no primeiro ticket filho) e o cadastro no registro.

## Não mexa

- Nos tickets CRM-10 e CRM-11 da outra sessão sem combinar: esta spec é o detalhamento do CRM-11; quem pegar um ticket daqui avisa o Nan.
- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Cada Sinal próprio tem teste, custo medido e passa pelo estado "Em teste" antes de "Disponível".
- [ ] Nenhum dado pessoal guardado sem necessidade (LGPD).

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Publicar cada actor na conta do Apify da Althius (a IA prepara o comando `apify push`; o login é do Nan).

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
