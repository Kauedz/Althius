# stripe-billing

A assinatura do Workspace pelo navegador (creditos-e-planos 05 e 06). O Administrador do Workspace pede, com o JWT:

- `{ action: 'checkout', workspaceId }`: cria o cliente do Stripe (uma vez) e abre o Checkout de assinatura, com um assento por Participante ativo. Devolve `{ url }`.
- `{ action: 'portal', workspaceId }`: abre o portal do Stripe (cartão, faturas, cancelar). Devolve `{ url }`.
- `{ action: 'seats', workspaceId }`: ajusta os assentos da assinatura aos Participantes ativos de hoje, com cobrança proporcional. Devolve `{ seats }`.

O banco confere que quem pede é Administrador ativo (`billing_context`) antes de o Stripe ser chamado.

- **Segredos:** `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `APP_ORIGIN`. Sem eles a função não sobe.
- **Chave restrita (recomendado pelo Stripe):** em `STRIPE_SECRET_KEY`, use uma chave restrita (`rk_…`) com só estas permissões: Customers (escrita), Checkout Sessions (escrita), Customer portal (escrita), Subscriptions (leitura) e Subscription items (escrita). Uma chave por ambiente (sandbox e produção).
- **Versão da API:** toda chamada vai com `Stripe-Version: 2026-08-26.dahlia` (`_shared/stripe.ts`).
- **CNPJ:** o Checkout pede o identificador fiscal (`tax_id_collection`) e atualiza nome e endereço do cliente.
- **Stripe Tax:** desligado. `STRIPE_AUTOMATIC_TAX=true` liga o `automatic_tax` no Checkout, só depois de configurar o endereço da sede e um registro ativo em Tax no painel do Stripe; sem registro, o Stripe não cobra imposto e não avisa.
- **Volta do Checkout:** `APP_ORIGIN/?assinatura=ok` ou `?assinatura=cancelada`.
- **Cupons:** o Checkout aceita códigos promocionais do Stripe (`allow_promotion_codes`), para dar desconto sem mexer no preço.
