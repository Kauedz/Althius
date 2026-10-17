# 01: Descadastro do e-mail da Sequência

**What to build:** Supressão por Workspace, link público por Envio, rodapé e List-Unsubscribe, bloqueio na liberação e
supressão pela resposta que pede para sair.

**GATE:** sem apply_migration nem execute_sql no remoto `ycbdilsmydvzezhlymty`, sem deploy, sem merge, sem segredo.

**Blocked by:** nenhum.

**Status:** ready-for-human

## Critérios

- [x] `public.contact_suppressions` (e-mail e domínio) com RLS por Workspace; `add_contact_suppression` para o manual.
- [x] Token aleatório de 64 hex por Envio, sem id; `unsubscribe_by_token` idempotente (registered, already_registered, invalid).
- [x] Registrar cancela os passos de E-mail pendentes do Contato e pausa a Sequência com o motivo "Descadastro".
- [x] Edge Function `descadastro` (verify_jwt = false): GET redireciona para `/descadastro?t=` do app; POST (um clique ou JSON) registra.
- [x] Página pública em pt-BR no app, com botão de confirmação (o Supabase não serve HTML no domínio padrão das functions).
- [x] Rodapé no corpo e `List-Unsubscribe`/`List-Unsubscribe-Post` (a Unipile aceita em custom_headers).
- [x] A liberação barra o Contato suprimido (`contact_suppressed`): pgTAP e Deno.
- [x] Resposta com SAIR, descadastrar ou "me remova" registra a Supressão: pgTAP. "Me tire uma dúvida" e "tirei esse e-mail do spam" não contam (casos negativos no pgTAP).
- [x] A resposta que pede para sair não gera Proposta de resposta, e a resposta aprovada não sai para Contato suprimido (`contact_suppressed`): pgTAP e Deno.
- [x] pgTAP rodado do zero num Postgres 16 local (129 arquivos verdes).

## Passos humanos

1. CI (Banco) verde com `supabase/tests/descadastro_e_variaveis.sql` e `envios_de_passo_por_email.sql`.
2. Aplicar `20261103100000_descadastro_e_variaveis_da_cadencia.sql` no remoto pelo fluxo de `docs/agents/migrations.md`.
3. Deploy de `descadastro`, `sequence-runner` e `sequence-step-sends` (usam `APP_ORIGIN` e `SUPABASE_URL`, que já existem) e do frontend.
4. Mandar um passo de teste para um e-mail próprio, clicar no rodapé, confirmar e ver a linha em `contact_suppressions` e a Sequência pausada.
