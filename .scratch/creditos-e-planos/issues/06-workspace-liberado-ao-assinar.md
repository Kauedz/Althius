# 06: O Workspace real só é liberado ao assinar

**What to build:** sem assinatura ativa, a pessoa entra só na Demonstração; o Workspace operacional (pessoal ou da empresa) fica bloqueado com a tela de assinatura; o setup libera o Workspace da empresa.

**Blocked by:** 05: Planos e assentos; a escolha do meio de pagamento.

**Status:** ready-for-human (código pronto; falta o Nan configurar o Stripe e publicar as funções)

## Pode mexer

- O fluxo de entrada (`auth/aplicativo.tsx`) e uma função que diz se o Workspace está ativo.

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [x] Sem assinatura: só Demonstração, com a chamada para assinar. — `auth/assinatura.tsx` (`TelaDeAssinatura`), lendo `workspace_access`; testes em `raiz.test.tsx`.
- [x] Os Workspaces de hoje (pré-produção) continuam liberados por uma marca manual do Administrador da Althius. — a migration marca `manual_release` em todos os Workspaces que existem quando ela roda; `public.set_manual_release` (só servidor) libera ou fecha um Workspace depois.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. No Stripe: criar o produto "Althius · assento" com um preço recorrente mensal de R$ 500 por unidade, e copiar o id do preço (`price_…`).
2. No Stripe: ligar o portal do cliente (Settings → Billing → Customer portal), permitindo trocar cartão, ver faturas e cancelar.
3. No Stripe: criar o endpoint de webhook `https://ycbdilsmydvzezhlymty.supabase.co/functions/v1/stripe-webhook` com os eventos `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` e `invoice.payment_failed`, e copiar o segredo (`whsec_…`).
4. No PowerShell, digitando as chaves no próprio terminal (nunca no chat):
   ```powershell
   npx supabase secrets set STRIPE_SECRET_KEY=<rk_... chave restrita> --project-ref ycbdilsmydvzezhlymty
   npx supabase secrets set STRIPE_PRICE_ID=<price_...> --project-ref ycbdilsmydvzezhlymty
   npx supabase secrets set STRIPE_WEBHOOK_SECRET=<whsec_...> --project-ref ycbdilsmydvzezhlymty
   ```
5. Publicar as funções:
   ```powershell
   cd "$HOME\Althius"; git checkout main; git pull
   npx supabase functions deploy stripe-billing --project-ref ycbdilsmydvzezhlymty
   npx supabase functions deploy stripe-webhook --project-ref ycbdilsmydvzezhlymty --no-verify-jwt
   ```
6. Decidir a cota de créditos por assento (depois de medir o custo real, ticket 01) e me dizer o número: eu gravo com `public.set_billing_settings`. Até lá, a fatura paga não lança crédito.
7. Quando o Stripe estiver pronto e testado, me dizer "pode ligar a cobrança": eu rodo `public.set_billing_settings(p_enforced => true)`. Até lá a cobrança fica desligada e todo Workspace abre (a pré-produção segue testando contas novas). Os Workspaces que já existem continuam liberados mesmo depois de ligar.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- **Decisão do Nan (2026-10-01):** o meio de pagamento é o Stripe; fazer da melhor maneira para a experiência e para a margem.
- Migration `20261001140000_assinatura_stripe.sql`: `private.workspace_subscriptions` (estado, liberação manual, cliente e assinatura do Stripe, assentos, fim do período), `billing_settings` (cota por assento, carência), `stripe_events` e `seat_credit_grants`. Funções: `workspace_access` (Participantes), `billing_context` (Administrador), e as do servidor (`record_stripe_customer`, `workspace_by_stripe_customer`, `apply_stripe_subscription`, `grant_seat_credits`, `claim_stripe_event`, `set_billing_settings`, `set_manual_release`). pgTAP `assinatura_stripe.sql` (25).
- Edge Functions `stripe-billing` (checkout, portal, ajustar assentos) e `stripe-webhook` (assinatura e cota por fatura, assinatura do Stripe conferida), com testes Deno.
- Escolhas pela experiência e pela margem: um assento por Participante ativo (mínimo 1); ajuste de assentos com cobrança proporcional; cupom aceito no Checkout; fatura atrasada mantém o Workspace aberto por 7 dias de carência; a cota de créditos entra só na criação e na renovação (o ajuste proporcional não dá crédito extra); evento atrasado do Stripe não desfaz um mais novo.
- A cobrança nasce **desligada** (`billing_settings.enforced = false`): todo Workspace abre até o Nan ligar, para a pré-produção não travar contas novas de teste antes do Stripe estar pronto.
- O bloqueio é da tela: se a leitura do acesso falha, o Workspace abre (nunca fecha por falha). As funções do banco ainda não recusam por falta de assinatura; isso pede rever cada função e fica para quando houver cliente pagando.

## Decisões a confirmar

- A cota de créditos por assento (hoje 0) e a carência (7 dias).
- Se o Workspace pessoal também precisa de assinatura própria ou entra no plano da empresa: hoje vale a regra do ticket (qualquer Workspace operacional sem assinatura fecha, salvo a liberação manual).

- **Revisão pelas boas práticas do Stripe (2026-10-01, plugin oficial):** versão da API fixada (`2026-08-26.dahlia`); `integration_identifier` no Checkout; CNPJ pedido no Checkout (`tax_id_collection`, com `customer_update` de nome e endereço); `invoice.payment_failed` registrado; Stripe Tax atrás de `STRIPE_AUTOMATIC_TAX` (desligado); chave restrita (`rk_…`) recomendada no lugar da secreta. Fica como sugestão, sem mudar teste existente: o webhook acha o Workspace pelo `workspace_id` do metadata antes do cliente do Stripe; o Stripe recomenda o contrário (cliente primeiro, metadata como reserva).
