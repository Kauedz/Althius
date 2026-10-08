# 05: Planos, assentos por usuário e o Observador

**What to build:** o Workspace tem um plano com assentos pagos (R$ 500 por usuário por mês); cada assento traz a cota de créditos ao saldo comum; um papel novo, Observador, só consulta, não conecta canais nem gasta crédito, e não conta como assento.

**Blocked by:** 02: Saldo e lançamentos.

**Status:** ready-for-agent (o Observador não existe; antes, combinar com a frente de Conexões e o Nan decidir a cota e o ajuste de assentos)

## Pode mexer

- Migration aditiva com o plano, os assentos e o papel `observer` nas Participações, conferindo cada função que hoje compara papel (`admin`/`member`) para que o Observador só leia.

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Observador só lê; nenhuma função de escrita aceita o papel.
- [x] A cota de créditos entra no saldo por assento ativo. — `grant_seat_credits` a cada fatura paga de criação ou renovação, assentos × cota (`billing_settings`); pgTAP `assinatura_stripe.sql`.
- [x] Remover um participante libera o assento no ciclo seguinte. — o Administrador ajusta os assentos ("Ajustar assentos", cobrança proporcional do Stripe); a cota do ciclo seguinte já vem com os assentos novos.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Confirmar o valor da cota de créditos por assento depois do ticket 01 (medir um cliente por um mês).
2. Aplicar a migration: `git checkout main`, `git pull`, `npx supabase db push` (na raiz do repositório).

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- 2026-10-01: o plano por assento entrou junto com o ticket 06 (Stripe). O papel **Observador** não entrou: hoje várias funções do banco aceitam qualquer Participação ativa para escrever, inclusive as da frente de Conexões (`save_target_account`, `create_contact`...), e um papel novo exigiria rever cada uma. Fica para combinar com aquela frente.

- 2026-10-07 (reconciliação contra a `main` 59e53a6):
  - Não feito: o papel Observador. `check (role in ('member','admin'))` em `20260927115135_convites_e_participantes.sql:13`; nenhuma migration fala em `observer`.
  - Cumprido no código, com o valor pendente: a cota por assento ativo (`grant_seat_credits`, `20261001140000_assinatura_stripe.sql:205-237`), mas `credits_per_seat` é 0 (`:36`). pgTAP `assinatura_stripe.sql` ok no CI 37707955273 ("com 100 por assento, 3 assentos trazem 300", "com a cota em zero, a fatura não lança crédito"); Deno "a fatura paga da criação ou da renovação traz a cota; a do ajuste proporcional, não".
  - Parcial: remover um participante libera o assento. O ajuste é manual ("Ajustar assentos", `src/auth/assinatura.tsx:137-140`) e usa `create_prorations` (`stripe-billing/handler.ts:114-120`), que credita na hora, e não no ciclo seguinte. Só há teste de aumento.
  - Testes rodados: `deno test --allow-all supabase/functions/stripe-billing/ supabase/functions/stripe-webhook/` → 12 passed, 0 failed.
  - Falta (agente): o papel Observador, revendo cada função que compara papel; os assentos acompanharem convites aceitos e remoções, ou pelo menos um teste de redução.
  - Decisões do Nan antes: o valor de `credits_per_seat` (hoje um Workspace novo não tem crédito nenhum, e Sinais, comitê, revelar e descoberta sempre reservam); se os assentos se ajustam sozinhos; se a redução vale só no ciclo seguinte (`proration_behavior: none`); e o combinado com a frente de Conexões sobre as funções dela.
