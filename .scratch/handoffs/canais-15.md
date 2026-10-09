# Handoff: canais-cadencia-backend 15, conexão Unipile ativa por configuração

Branch: `kaue/canais-15-conexao-unipile-ativa`. Ticket: `.scratch/canais-cadencia-backend/issues/15-conexao-unipile-ativa-por-configuracao.md`. Status do ticket: `ready-for-human` (faltam os Passos do Nan).

## Gate

Passou. O único Blocked by é a ADR-0024 aceita, e o PR #157 está mergeado na `main`. Spec, ADR e os oito critérios estavam completos.

## O que mudou

- `supabase/migrations/20261009205538_conexao_unipile_ativa.sql` (uma só, aditiva):
  - `private.unipile_connections`: nome, endereço (`https://host[:porta]`), versão `v1`/`v2`, **nomes** dos segredos no Vault, `active`. Índice único parcial garante uma só ativa. Nenhuma coluna guarda chave ou segredo.
  - Conexão `padrão` (v2, `https://api.unipile.com`) ativa; todas as Contas remetentes existentes ficam ligadas a ela. Segredos esperados no Vault: `unipile_padrao_api_key` e `unipile_padrao_webhook_secret` (enquanto não existirem, as funções seguem nas variáveis de hoje; a leitura é do canais-16).
  - `private.sender_accounts`: `unipile_connection_id` (not null, default = conexão ativa) e `unipile_connection_since` (null até a primeira troca). A unicidade do id é `unique (unipile_connection_id, unipile_account_id)` (decisão do Kauê); o `unique` global caiu.
  - `public.register_unipile_connection(...)` (upsert por nome, valida versão, https e nomes de segredo) e `public.activate_unipile_connection(id)` (desativa a anterior, marca as Contas das outras conexões como `reconnect_required` com `reconciliation_required`, devolve quantas; ativar a que já está ativa devolve 0). Só `service_role`; o Nan chama pelo SQL Editor.
  - `complete_sender_connection_attempt` redefinida a partir da versão de `20260927114500`. Linha de uma conexão que já não é a ativa aceita o id novo e a conexão ativa **na mesma linha**; a linha já na conexão ativa com id diferente, dono/provedor/canal que não batem → `identity_mismatch`; id novo já ligado a outra linha da ativa → `identity_already_linked`. O insert usa `on conflict (unipile_connection_id, unipile_account_id)`.
  - `claim_sender_reconciliations`, `conversations_to_reconcile` e `chats_to_reconcile` redefinidas: só Contas da conexão ativa, e só Envios **posteriores** a `unipile_connection_since` (um Envio da conexão anterior não é consultado na conta nova).
- `supabase/tests/conexao_unipile_ativa.sql`: pgTAP novo, 51 asserções.
- `scripts/wizard-unipile.sh`: pede nome, versão e endereço; valida a chave na API da conexão; registra o webhook (v2 por API, v1 manual); gera um bloco SQL (Vault + cadastro + ativação, esta com confirmação) para o SQL Editor; mantém o bloco de segredos de função como **reserva até o canais-16**. Nada é gravado em disco.
- `docs/agents/migrations.md`: seção "Swapping the Unipile account".
- O ticket: checkboxes 1–6 e 8 marcados, status `ready-for-human`.

## Decisão que vale registrar

Como marcar "o que saiu pela conexão anterior" sem coluna nova em `sequence_step_sends` (o ticket só autoriza coluna em `sender_accounts`): a linha guarda **quando** passou para a conexão atual, e a reconciliação ignora Envios com `sent_at <= unipile_connection_since`. Linha que nunca trocou tem `null` e não filtra nada, então os testes existentes não mudam.

## Loop

Vermelho primeiro: o teste novo falhou com `relation "private.unipile_connections" does not exist`. Depois da migration, 51/51. Mutação: tirando o filtro por `unipile_connection_since`, o teste "a send of the previous connection is not looked up in the new account" fica vermelho. A asserção equivalente de `chats_to_reconcile` é fraca (o Envio do teste é de e-mail, então dá 0 com ou sem filtro); o filtro de chat é igual ao de e-mail, mas não está provado por teste próprio.

pgTAP não estava instalado e o `apt-get install` e a edição do `pg_hba.conf` foram negados no ambiente. Contornei em userland: cluster Postgres 16 descartável em `/var/tmp/althius-pgtap` e o pgTAP v1.3.3 carregado como script SQL (sem `create extension`). Não alterei a configuração do sistema. Esse cluster não é do repositório.

Resultados:

- pgTAP, suíte inteira do zero: 70 arquivos, todos ok, nenhuma asserção existente mudou.
- `deno test supabase/functions`: 787 passed, 0 failed.
- `tsc -b`: limpo. `oxlint`: exit 0 (só avisos antigos).
- vitest: 121 arquivos, 1156 testes, todos ok (nenhum arquivo de frontend foi alterado).

## O que não está provado

- O wizard não foi executado de ponta a ponta (é interativo e precisa de uma conta Unipile real). Verificado: `bash -n`, e o SQL que ele gera (com nome contendo apóstrofo) rodou num banco local com um `vault` de mentira. Por isso o critério do wizard continua desmarcado no ticket.
- O Vault real não existe no pgTAP local; nada na migration lê o Vault.
- Os campos da v1 (endpoint de chaves/contas e de webhook) seguem "não confirmados" até o canais-17.

## Para quem pega o canais-16 e o canais-17

- Estas funções ainda buscam a linha só por `unipile_account_id`, e agora o id pode repetir entre conexões: `ingest_unipile_email_event`, `ingest_unipile_chat_event`, `apply_unipile_sender_status`, `hold_sequences_of_lost_sender`. Não mexi (ingestão e webhook estão fora do ticket). O canais-17 deve passar a conexão ativa, ou filtrar por ela.
- O Executor não ganhou filtro próprio: um Envio só sai por Conta `ready` e sem reconciliação pendente, e a ativação deixa todas as Contas das outras conexões em `reconnect_required`. Se um webhook com id repetido religar uma Conta antiga, essa garantia depende do ponto acima.
- A leitura da conexão ativa (`private.active_unipile_connection_id()` e a linha com os nomes dos segredos) já existe para o canais-16.

## Arquivos compartilhados

Nenhum fora da área. `docs/agents/migrations.md` é compartilhado (só ganhou uma seção ao final).

## Pendente (humano)

1. Com o CI verde, aplicar `20261009205538_conexao_unipile_ativa.sql` no projeto `ycbdilsmydvzezhlymty` pelo `execute_sql`, no bloco atômico de `docs/agents/migrations.md`. **Não apliquei.**
2. `bash scripts/wizard-unipile.sh` para cadastrar a conexão da conta ativa e gravar chave e segredo no Vault. A cada troca de conta, repetir só esse passo e pedir às pessoas que reconectem o canal.
3. Na tela de Conexões, conferir que a Conta remetente volta como "pronta" depois da reconexão e que as respostas de antes continuam na Sequência.

Sem deploy de função.
