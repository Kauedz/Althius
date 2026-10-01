# stripe-webhook

Os avisos do Stripe sobre a assinatura (creditos-e-planos 05 e 06). O Stripe chama sem JWT (`verify_jwt = false`); a função confere o cabeçalho `Stripe-Signature` com `STRIPE_WEBHOOK_SECRET` (HMAC-SHA256, tolerância de 5 minutos) antes de ler qualquer coisa.

- `customer.subscription.created`, `.updated`, `.deleted`: grava o estado (ativa, atrasada, cancelada), os assentos e o fim do período (`apply_stripe_subscription`). Um evento mais velho que o último aplicado não muda nada.
- `invoice.paid` com `billing_reason` `subscription_create` ou `subscription_cycle`: a cota de créditos dos assentos entra no saldo do Workspace (`grant_seat_credits`), uma vez por fatura. A fatura de um ajuste proporcional de assentos não traz cota.
- Outros eventos: aceitos e ignorados.

Configurar no Stripe um endpoint para `https://<projeto>.supabase.co/functions/v1/stripe-webhook` com esses quatro eventos.
