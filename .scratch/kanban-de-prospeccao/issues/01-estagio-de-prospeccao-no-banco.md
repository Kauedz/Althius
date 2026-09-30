# 01: Estágio de prospecção no banco

**What to build:** cada Conta-alvo tem um Estágio de prospecção (Descoberta, Quente, Fit, Em abordagem, Respondeu, Reunião, No CRM, Descartada), com o histórico de cada mudança (quem ou qual evento, quando); Contas existentes e importadas começam em Descoberta.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

## Pode mexer

- Migration aditiva: coluna ou tabela de estágio, histórico e as funções `move_prospecting_stage` (usuário, com a regra de responsabilidade das Contas) e `private.advance_prospecting_stage` (eventos).
- pgTAP novo.

## Não mexa

- Em `save_target_account` (frente de Conexões): o estágio fica fora dela.
- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [x] Estágios fixos (ADR-0020); valor fora da lista recusado.
- [x] Mover à mão segue a responsabilidade da Conta (ADR-0009).
- [x] Evento nunca volta um cartão depois de Em abordagem.
- [x] Histórico com autor ou evento.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Aplicar a migration: `git checkout main`, `git pull`, `npx supabase db push` (na raiz do repositório).

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- Decisões: a Conta sem linha está em Descoberta (sem backfill, sem mexer em `save_target_account`); mover à mão é só do vendedor responsável, nem o Admin move Conta de outro; No CRM não se move à mão, só o envio ao CRM (ticket 05) define; Descartada só sai à mão; o evento antes da abordagem vai para qualquer estágio (Sinal vencido volta a Descoberta).
- Leitura para a tela: `list_prospecting_stages` e `get_prospecting_history`.
