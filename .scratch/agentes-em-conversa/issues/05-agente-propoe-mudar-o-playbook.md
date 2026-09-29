# 05: O Agente propõe mudar o Playbook

**What to build:** quando a Conversa chega a um ICP, a Personas ou a uma dor nova, o Agente propõe a mudança na seção, que vira uma Revisão da Memória do Workspace e só vale com Aprovação de Administrador.

**Blocked by:** 03: Contexto do Playbook nos Agentes; CRM-15 (Aprovações); CRM-09 (Revisão).

**Status:** needs-info (depende do CRM-15)

## Pode mexer

- A orquestração (proposta como evento) e a criação da Revisão pelo fluxo do CRM-09.

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Nada muda no Playbook sem Aprovação de Administrador.
- [ ] A Conversa mostra a proposta e o estado dela.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Se o ticket criou migration: `git checkout main`, `git pull`, `npx supabase db push` (na raiz do repositório).
2. Publicar a função: `npx supabase functions deploy agent-conversation --project-ref ycbdilsmydvzezhlymty`.
3. Reiniciar o worker do Hermes (janela 2): fechar com Ctrl+C e rodar de novo o comando de `supabase/functions/_hermes-worker/README.md`.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
