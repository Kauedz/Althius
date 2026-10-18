# 03: Falar com a equipe Althius

**Status:** closed

**GATE:** pode seguir na mesma PR. Sem aplicar migração, sem deploy e sem alterar segredo. O e-mail reusa `resend.ts` de `workspace-invitation-email`. Destino fixo `althius.relacionamento@gmail.com` (não vem do cliente). Sem cobrança.

## O que construir

- Card final sempre visível, cor normal: "Precisa de outro Sinal?" / "Conte o evento que você quer acompanhar e a equipe Althius monta para você." / "Falar com a equipe Althius".
- Formulário: evento (obrigatório), empresas ou nicho (pré-preenchido com o ICP do Workspace), fontes (opcional), urgência (Esta semana / Este mês / Sem pressa), contato (nome e e-mail pré-preenchidos, WhatsApp opcional).
- Ao enviar: "Pedido recebido, a equipe responde em até 2 dias úteis" e a lista "Seus pedidos" (novo → em análise → em construção → disponível / recusado).
- Rota `/sinais/tipos/personalizado/novo` sai (redireciona para o pedido).
- Tabela `public.signal_requests` e RPC `public.request_signal`. RLS: membro ativo lê e insere o próprio pedido; só `private.is_althius_staff()` atualiza.
- Edge Function `signal-request-notify`.

## Pode mexer

- Migração nova (timestamp maior que a do ticket 01) e pgTAP dela.
- `supabase/functions/signal-request-notify/**`, `supabase/config.toml`.
- A página de Sinais e uma página nova do pedido, em `paginas/sinais/`.

## Não mexa

- `resend.ts` (só importar). Segredos. Cobrança, créditos, Automação.
- `perfil-personalizado.tsx` (ver spec).

## Critérios

- [x] Membro insere e lê o pedido do próprio Workspace; outro Workspace não lê; anon não chama; quem não é equipe não atualiza o status.
- [x] O teste da função cobre o envio ao endereço da equipe, sem rede.
- [x] O formulário recusa evento vazio e mostra a confirmação e a lista.

## Passos do Nan

1. Aplicar `supabase/migrations/20261015160000_pedidos_de_sinal.sql` pelo bloco atômico de `docs/agents/migrations.md`, depois do CI verde. Conferir o md5.
2. Publicar a função `signal-request-notify` (os segredos `RESEND_API_KEY`, `APP_ORIGIN` e `SUPABASE_URL` já existem; nenhum segredo novo).
3. Inserir em `private.althius_staff` o `user_id` de quem pode mudar o status. Sem isso, o pedido é gravado e o e-mail sai, mas ninguém atualiza o status pela RPC.

## Comments

Implementado nesta branch, sem aplicar no remoto e sem deploy. A migração `20261015160000_pedidos_de_sinal.sql` cria `public.signal_requests` e as RPCs `request_signal`, `list_signal_requests`, `review_signal_request` e `claim_signal_request_notice`. A Edge Function `signal-request-notify` reusa `resend.ts` e envia para `althius.relacionamento@gmail.com`. O card "Precisa de outro Sinal?" abre `/sinais/pedidos`. A rota antiga `/sinais/tipos/personalizado/novo` redireciona para lá. `perfil-personalizado.tsx` permanece (perfil firmográfico do público). pgTAP em `supabase/tests/pedidos_de_sinal.sql` (plan 11). Teste Deno da função sem rede.

Passos do Nan, depois do CI verde: aplicar a migração pelo bloco atômico (depois da `20261015150000`) e conferir o md5. Publicar `signal-request-notify` com os segredos que já existem (`RESEND_API_KEY`, `APP_ORIGIN`, `SUPABASE_URL`, `INVITE_EMAIL_FROM`); nenhum segredo novo. Inserir em `private.althius_staff` o `user_id` de quem pode mudar o status. Sem essa linha, o pedido é gravado e o e-mail sai, mas a RPC de status recusa.
