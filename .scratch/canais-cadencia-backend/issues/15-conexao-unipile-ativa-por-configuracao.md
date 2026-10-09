# 15: Conexão Unipile ativa por configuração e troca sem perder histórico

**What to build:** a conta Unipile ativa passa a ser uma configuração no banco (endereço, versão, chave e segredo do webhook), e trocar de conta é cadastrar a nova e ativá-la, sem publicar código. Na troca, as Contas remetentes ficam `reconnect_required`, e quando a pessoa reconecta o canal a **mesma** Conta remetente recebe o id novo, com Envios, respostas e Interações ainda ligados a ela. Resolve o `identity_mismatch` do `complete_sender_connection_attempt` para o caso de troca de fornecedor, como diz a [ADR-0024](../../../docs/adr/0024-contratos-v1-e-v2-da-unipile-e-troca-de-conta-sem-perder-historico.md).

**Blocked by:** ADR-0024 aceita (PR #157 mergeado). Pode andar em paralelo com o canais-14: este ticket é banco e wizard, o 14 é o módulo TypeScript.

**Status:** ready-for-human

- [x] Existe um registro de conexões Unipile com nome, endereço, versão (`v1` ou `v2`), os nomes dos segredos da chave e do webhook no Vault, e se está ativa. O banco garante, com índice único parcial, que **no máximo uma** está ativa. Nenhuma coluna guarda a chave nem o segredo em texto.
- [x] A migration cria a conexão "padrão" (v2, `https://api.unipile.com`) ativa e liga a ela todas as Contas remetentes que já existem, para o sistema atual seguir igual. Enquanto o Vault não tiver os segredos dela, as funções continuam lendo as variáveis de hoje (a leitura em si é do canais-16).
- [x] Cada Conta remetente guarda a conexão a que o seu `unipile_account_id` pertence. A unicidade do id passa a ser **por conexão**, não global.
- [x] Operação de cadastrar uma conexão, e outra de ativar uma, só para o Nan (superadmin) e `service_role`. Ativar uma conexão desativa a anterior e marca todas as Contas remetentes das outras conexões como `reconnect_required`, o que a ADR-0015 já exige. Nenhum Envio, resposta, Interação ou Conta remetente é apagado.
- [x] `complete_sender_connection_attempt`: uma reconexão de uma linha cujo id pertence a uma conexão **que já não é a ativa** aceita o id novo e a conexão ativa na **mesma** linha, mantendo `id`, dono, canal e provedor, e `reconciliation_required`. Continua `identity_mismatch` se a linha já é da conexão ativa, se o dono ou o provedor não batem, ou se a tentativa não é uma reconexão daquela linha. Continua `identity_already_linked` se o id novo já pertence a outra linha da mesma conexão.
- [x] A conferência e a reconciliação (`conversations_to_reconcile`, `chats_to_reconcile`) e o Executor olham só Envios e Contas remetentes da conexão ativa. Um Envio da conexão anterior não é consultado na conta nova, e o que já foi gravado continua legível para o titular.
- [ ] `scripts/wizard-unipile.sh` passa a cadastrar a conexão (endereço, versão) e a gravar a chave e o segredo no Vault, sem pedir nada pelo chat, e a ativá-la. Os segredos de função atuais ficam documentados como reserva até o canais-16.
- [x] pgTAP novo: cadastro e ativação; só uma ativa; a troca marca as Contas e não apaga nada; reconectar depois da troca reaproveita a linha e mantém os Envios e as respostas ligados; os casos de `identity_mismatch` que continuam recusados; a reconciliação ignora a conexão anterior. Os testes pgTAP existentes não mudam de asserção.

## Pode mexer

- Uma migration nova (timestamp depois da última da `main`), seguindo `docs/agents/migrations.md`: tabela de conexões, coluna e unicidade em `private.sender_accounts`, as operações de cadastro e ativação, a redefinição de `complete_sender_connection_attempt` a partir da definição mais recente da `main`, e os filtros de conexão ativa na reconciliação.
- `supabase/tests/` (pgTAP novo).
- `scripts/wizard-unipile.sh` e `docs/agents/migrations.md` (só o trecho do procedimento de troca).

## Não mexa

- Código TypeScript das Edge Functions: ler a conexão e escolher o adaptador é do canais-16.
- O webhook (`unipile-account-status`): é do canais-17.
- Frontend. A tela de Conexões continua mostrando "reconectar" como hoje.
- `private.chat_message_fields` e a ingestão de eventos.
- Apagar, mover ou reescrever Envios, respostas e Interações.

## Migration

**Sim.** Aditiva, uma só. A única função existente que ela redefine é `complete_sender_connection_attempt` (e as de reconciliação, só para filtrar a conexão ativa). Só entra coluna nova em `sender_accounts`.

## Passos do Nan

1. Com o CI verde, aplicar a migration no projeto `ycbdilsmydvzezhlymty` pelo `execute_sql`, no bloco atômico de `docs/agents/migrations.md`.
2. Rodar `bash scripts/wizard-unipile.sh` para cadastrar a conexão da conta ativa e gravar a chave e o segredo no Vault. Em cada troca de conta, repetir só esse passo e pedir às pessoas que reconectem o canal.
3. Conferir na tela de Conexões que a Conta remetente volta como "pronta" depois da reconexão, e que as respostas de antes continuam na Sequência.

## Comments

- 2026-10-09, decisão do Kauê: a unicidade do `unipile_account_id` passa a ser **por conexão** (`unique (unipile_connection_id, unipile_account_id)`), porque a mesma conta Unipile pode reaparecer em outra conexão.
- 2026-10-09, canais-15 (agente): critérios 1-6 e 8 fechados no banco e no pgTAP (`supabase/tests/conexao_unipile_ativa.sql`, 51 asserções; suíte inteira 70/70). O critério do wizard fica aberto de propósito: a sintaxe e o SQL que ele gera foram validados contra um banco local, mas ele só se prova rodando com uma conta Unipile real (Passos do Nan 2 e 3). Handoff em `.scratch/handoffs/canais-15.md`.
