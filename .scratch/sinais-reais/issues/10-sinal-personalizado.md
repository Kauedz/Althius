# 10: Sinal personalizado

**What to build:** o participante descreve o Sinal que quer; um Agente monta o Sinal combinando actors do registro (fonte, filtro, palavra-chave, região) e mostra o custo; o que não der vira um pedido ao time da Althius (serviço, 1 incluso no setup).

**Blocked by:** 02: Monitoramento real; `agentes-em-conversa` 02.

**Status:** needs-triage

## Pode mexer

- A tela de pedido de Sinal personalizado e a orquestração que combina actors.

## Não mexa

- Nos tickets CRM-10 e CRM-11 da outra sessão sem combinar: esta spec é o detalhamento do CRM-11; quem pegar um ticket daqui avisa o Nan.
- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Sinal combinado passa por "Em teste" antes de rodar no automático.
- [ ] Pedido ao time fica registrado com estado.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Se o ticket criou migration: `git checkout main`, `git pull`, `npx supabase db push` (na raiz do repositório).
2. Publicar a função: `npx supabase functions deploy signal-scan --project-ref ycbdilsmydvzezhlymty`.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
