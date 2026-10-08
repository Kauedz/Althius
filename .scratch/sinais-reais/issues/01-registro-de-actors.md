# 01: Registro de actors do Apify

**What to build:** uma tabela de serviço lista os actors que a Althius usa (id no Apify, versão, preço conhecido, Sinal que atende, estado: disponível, em teste ou fora), e uma Edge Function chama o actor pela conta da Althius com teto de custo por execução, no padrão da `contact-photo-lookup`.

**Blocked by:** None.

**Status:** closed

## Pode mexer

- Migration aditiva com a tabela e as funções de leitura.
- Edge Function nova `signal-scan` (só backend), com `handler.ts` testável sem rede.
- O `APIFY_TOKEN` que já existe nos segredos.

## Não mexa

- Nos tickets CRM-10 e CRM-11 da outra sessão sem combinar: esta spec é o detalhamento do CRM-11; quem pegar um ticket daqui avisa o Nan.
- Na Edge Function `contact-photo-lookup`.
- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [x] Custo de cada execução gravado (`creditos-e-planos` 01).
- [x] Actor fora do registro nunca roda.
- [x] Os 9 actors do lançamento cadastrados (ver `.scratch/modulo-de-sinais/pesquisa-actors-apify.md`).

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Aplicar a migration: `git checkout main`, `git pull`, `npx supabase db push` (na raiz do repositório).
2. Publicar `signal-scan`: `npx supabase functions deploy signal-scan --project-ref ycbdilsmydvzezhlymty`.
3. Guardar os tokens das contas gratuitas do Apify como segredos (`APIFY_TOKEN`, `APIFY_TOKEN_2` a `APIFY_TOKEN_5`), pelo comando `npx supabase secrets set` no PowerShell, sem colar o token no chat. Plano pago só quando fechar o primeiro cliente.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- Feito na PR https://github.com/Kauedz/Althius/pull/97 (registro e função). Várias contas do Apify (rodízio quando o crédito acaba) em PR seguinte.
- 07/10/2026: Status corrigido para `closed`, como a auditoria de 01/10 (`.scratch/AUDITORIA-2026-10-01.md`, seção 6) dá. Conferido no remoto (só leitura): migration aplicada, `signal-scan` publicada e os 9 actors `available`. O estado `available` foi gravado à mão no remoto: um banco novo ou o CI nasce com todos `testing`. Os segredos `APIFY_TOKEN*` não foram conferidos.
