# 02: Movimentos automáticos por eventos

**What to build:** os eventos movem o cartão: Sinal novo → Quente; Fit → Fit e Não fit → Descartada; primeiro Envio → Em abordagem; resposta → Respondeu; reunião marcada → Reunião; enviada → No CRM; Sinais vencidos antes da abordagem → Descoberta.

**Blocked by:** 01: Estágio de prospecção no banco.

**Status:** ready-for-agent

## Pode mexer

- Chamadas a `private.advance_prospecting_stage` nos pontos onde cada evento já existe (Envio e resposta existem hoje).
- Para os eventos que ainda não existem (Sinal real, Fit, reunião, envio ao CRM), o ponto de chamada fica documentado e cada spec dona chama ao entregar.

## Não mexa

- Nas funções de envio (`private.release_step_send`) e de ingestão de e-mail sem partir da definição da migration 20260929170000.
- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [x] Envio e resposta movem o cartão já neste ticket.
- [x] Os outros eventos têm teste com o gancho simulado.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Aplicar a migration: `git checkout main`, `git pull`, `npx supabase db push` (na raiz do repositório).

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- Gancho único `private.record_prospecting_event(workspace, conta, evento)` com os nomes: `sinal_novo`, `fit`, `nao_fit`, `primeiro_envio`, `resposta`, `reuniao_marcada`, `enviada_ao_crm`, `sinais_vencidos` (tabela na migration 20260930150000). Cada spec dona chama ao entregar o evento.
- Envio e resposta entram por gatilho em `private.sequence_step_sends` (status vira `sent`) e `private.received_emails` (insert), sem redefinir `release_step_send` nem a ingestão.
- Eventos de avanço nunca voltam o cartão; só `sinais_vencidos` volta, e só antes da abordagem.
