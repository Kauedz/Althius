# 05: O Agente propõe mudar o Playbook

**What to build:** quando a Conversa chega a um ICP, a Personas ou a uma dor nova, o Agente propõe a mudança na seção, que vira uma Revisão da Memória do Workspace e só vale com Aprovação de Administrador.

**Blocked by:** 03: Contexto do Playbook nos Agentes; CRM-15 (Aprovações); CRM-09 (Revisão).

**Status:** ready-for-human (feito junto com o CRM-09 em 2026-10-09; faltam os Passos do Nan)

## Pode mexer

- A orquestração (proposta como evento) e a criação da Revisão pelo fluxo do CRM-09.

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [x] Nada muda no Playbook sem Aprovação de Administrador. (A proposta do Agente vira uma Aprovação de revisão que nasce sempre pendente; só `decide_approval` de um Administrador ativo grava a versão. pgTAP `revisao_do_playbook_por_aprovacao.sql`, blocos 2, 5, 7 e 10.)
- [x] A Conversa mostra a proposta e o estado dela. (O passo "Scopus propôs uma nova versão do ICP — aguardando Aprovação de um Administrador" traz o cartão com a vigente ao lado da proposta e o estado; `revisao-do-playbook-real.test.tsx` e [o print](../../crm-real-e-stack/issues/prints/09-conversa-proposta.jpg).)

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Se o ticket criou migration: `git checkout main`, `git pull`, `npx supabase db push` (na raiz do repositório).
2. Publicar a função: `npx supabase functions deploy agent-conversation --project-ref ycbdilsmydvzezhlymty`.
3. Reiniciar o worker do Hermes (janela 2): fechar com Ctrl+C e rodar de novo o comando de `supabase/functions/_hermes-worker/README.md`.

## Comments

**2026-10-09 (Claude Code).** Feito no PR do CRM-09 (`.scratch/crm-real-e-stack/issues/09-icp-e-personas-aprovados.md`, comentário do dia): a ferramenta `propor_mudanca_no_playbook` no catálogo compartilhado (a ponte e o worker do Hermes), a Aprovação da categoria revisão no banco e o cartão no passo da Conversa e na fila. A migration é a `20261009220509_revisao_do_playbook_por_aprovacao.sql`, então o passo 1 vale; os passos 2 e 3 também. A conferência real está nos Passos do Renan do CRM-09.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
