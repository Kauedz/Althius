# 05: Planos, assentos por usuário e o Observador

**What to build:** o Workspace tem um plano com assentos pagos (R$ 500 por usuário por mês); cada assento traz a cota de créditos ao saldo comum; um papel novo, Observador, só consulta, não conecta canais nem gasta crédito, e não conta como assento.

**Blocked by:** 02: Saldo e lançamentos.

**Status:** needs-info (o papel novo mexe nas Participações; confirmar com o Nan antes)

## Pode mexer

- Migration aditiva com o plano, os assentos e o papel `observer` nas Participações, conferindo cada função que hoje compara papel (`admin`/`member`) para que o Observador só leia.

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Observador só lê; nenhuma função de escrita aceita o papel.
- [ ] A cota de créditos entra no saldo por assento ativo.
- [ ] Remover um participante libera o assento no ciclo seguinte.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Confirmar o valor da cota de créditos por assento depois do ticket 01 (medir um cliente por um mês).
2. Aplicar a migration: `git checkout main`, `git pull`, `npx supabase db push` (na raiz do repositório).

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
