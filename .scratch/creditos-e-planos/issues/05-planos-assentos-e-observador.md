# 05: Planos, assentos por usuário e o Observador

**What to build:** o Workspace tem um plano com assentos pagos (R$ 500 por usuário por mês); cada assento traz a cota de créditos ao saldo comum; um papel novo, Observador, só consulta, não conecta canais nem gasta crédito, e não conta como assento.

**Blocked by:** 02: Saldo e lançamentos.

**Status:** ready-for-human (plano por assento e cota prontos com o ticket 06; o Observador fica para depois de combinar com a frente de Conexões)

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
