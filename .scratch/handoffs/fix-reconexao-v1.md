# Handoff: correção da reconexão depois da troca para a v1

Branch `kaue/fix-reconexao-v1`, base `main` (a3e31e7). Dois bugs de produção achados ao conectar a primeira conta v1.

## Bug 1: IMAP recusado pela v1

`_shared/unipile/bridge-v1.ts`: o assistente da v1 recusava `providers: ['IMAP']` com 400 `invalid_parameters`. GOOGLE, OUTLOOK e MAIL dão 201 (conferido na conta v1 real). Agora `imap` vai como `MAIL`. A volta continua certa: `normalizeV1Provider('MAIL')` já devolvia `IMAP` para a Conta remetente.

Teste: `bridge.test.ts`, "[v1] link de conexão: cada provedor vai com o nome que o assistente da v1 aceita (IMAP é MAIL)". Vermelho antes (`IMAP` != `MAIL`).

## Bug 2: reconectar uma conta da conexão anterior dava 404

`sender-accounts` pedia `type: 'reconnect'` com o `provider_account_id` da conta v2 antiga, e a API v1 respondia 404 Account not found.

Correção, em duas pontas:

- **Banco** (`20261010001035_reconexao_depois_da_troca_de_conta.sql`): `create_sender_connection_attempt` devolve `provider_account_id = null` quando a linha não é da conexão ativa. A tentativa continua gravando `reconnect_sender_account_id`, então `complete_sender_connection_attempt` (já pronto desde o canais-15) grava o id novo e a conexão ativa **na mesma linha** (ADR-0024: nada se perde). Mesma assinatura, `create or replace`, permissões intactas. Sem conexão ativa, nada muda.
- **Função** (`sender-accounts/link.ts`, novo): `authLinkFor(action, channel, attempt)` decide o link. Reconexão só com o id presente; sem ele, `create` com os provedores do canal (`providerNames`, movido de `index.ts` para `link.ts`). `index.ts` só chama.

### Por que no banco e não só na função

A função não enxerga `private.sender_accounts` (não está exposto) nem sabe a conexão de cada linha; o banco já faz a comparação com a conexão ativa dentro da mesma transação que abre a tentativa. Fazer na função pediria uma RPC nova ou mudar o tipo de retorno (drop + create). Anular o id é a menor mudança: o contrato (attempt_id, provider, provider_account_id) é o mesmo, e "sem id para reconectar" já era o caso de uma conexão nova.

Testes:

- `sender-accounts/link.test.ts`: conectar, reconectar na conexão ativa, reconectar de outra conexão.
- `supabase/tests/conexao_unipile_ativa.sql` (plano 51 → 53): linha da conexão anterior não recebe id; linha da ativa continua recebendo. Vermelho antes (`unipile-a-1` != `(sem id)`).

## Resultado local

- `deno test supabase/functions`: 975 passaram, 0 falharam; `deno check supabase/functions/*/index.ts` limpo; guard `sem-base-fixa` ok.
- pgTAP, suíte inteira num Postgres 16 descartável: tudo `ok`, incluindo `conexao_unipile_ativa` 53/53.
- `deno lint`: 1 aviso que já existia na main (`account-directory.test.ts:18`, `require-await`), fora desta correção. O CI não roda `deno lint` nem `deno fmt`.

## Pendente de publicação (nada foi aplicado nem publicado)

- **Migration** `20261010001035_reconexao_depois_da_troca_de_conta.sql`: aplicar no remoto, na ordem de `docs/agents/migrations.md`.
- **Função** `sender-accounts` (verify_jwt true). Só ela: `unipile-account-status` não mudou.
- Ordem sugerida: migration antes da função. Se a função sair antes, a reconexão segue como hoje (o id antigo ainda vem do banco); se a migration sair antes, a função antiga recebe `provider_account_id` nulo e pede `reconnect` sem id, que a v1 recusa: dá erro claro, não corrompe nada.

## Observações

- O link de troca usa todos os provedores do canal. Quem reconecta com um provedor diferente do da linha (por exemplo Outlook onde era Gmail) recebe `identity_mismatch` do banco, como já estava testado no canais-15.
- Nada em arquivo compartilhado fora da área de canais.
