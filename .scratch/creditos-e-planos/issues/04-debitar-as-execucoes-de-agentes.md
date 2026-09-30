# 04: Debitar as Execuções de Agentes

**What to build:** cada chamada de Agente reserva e debita créditos pelo contrato do ticket 02; sem saldo, a Execução falha com o motivo "saldo insuficiente", sem resposta inventada.

**Blocked by:** 02: Saldo e lançamentos; `agentes-em-conversa` 02.

**Status:** ready-for-agent

## Pode mexer

- `_shared/orquestracao.ts` e o `claim`/`finish` das Execuções, só para reservar e debitar.

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [x] Um Agente por rodada = um débito; chave de IA do cliente = 20%.
- [x] Sem saldo: falha com motivo claro.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Publicar a ponte e reiniciar o worker do Hermes (o banco a IA aplica pelo conector do Supabase):
   ```powershell
   cd "$HOME\Althius"
   git checkout main
   git pull
   npx supabase functions deploy agent-conversation --project-ref ycbdilsmydvzezhlymty
   ```
   No terminal do worker, `Ctrl+C` e ligar de novo:
   ```powershell
   npx -y deno@2 run --allow-net --allow-env --allow-read --env-file=supabase/functions/_hermes-worker/.env supabase/functions/_hermes-worker/main.ts
   ```
2. Nada muda para o Workspace de vocês até a cobrança ser ligada (ticket 06, `set_credits_enforced`). Para testar a falta de saldo num Workspace de teste, a IA liga e desliga a cobrança nele.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- Contrato: `begin_agent_round(execução, Agente, rodada, chave_do_cliente)` devolve `free` (cobrança desligada), `go` (reservou 1 crédito; 0,20 com a chave de IA do cliente), `paid` (rodada já paga: roda de novo sem cobrar) ou `no_credits`; `end_agent_round(reserva, concluída)` debita ou solta. A chave é a Execução + o Agente + a rodada, então repetir nunca cobra duas vezes; a reserva já solta dá lugar a uma nova tentativa.
- No motor: `comCreditos` (em `_shared/orquestracao.ts`) envolve só o `trabalhar` do Executor — um Agente por rodada —; a escolha da Coordenação e a síntese não cobram. Vale nos dois motores (a ponte e o worker do Hermes por Agente) porque `coordenarPedido` e `conversarNaPagina` o aplicam quando `db.creditos` existe. O modo antigo do Hermes de uma chamada só (`HERMES_UMA_CHAMADA=true`) não tem rodada por Agente e segue sem cobrar.
- Sem saldo: o Agente nem roda e a Execução fecha como falha com o motivo `insufficient_credits`, que a tela mostra em português (`supabase-conversas.ts`). Nenhuma resposta é inventada.
- **A cobrança é por Workspace e nasce desligada** (`private.workspace_billing.credits_enforced`): a ADR-0019 só cobra quem assina, e ninguém tem crédito até o ticket 05/06 entrar. Sem isso, ligar este ticket travaria todos os Agentes hoje. O ticket 06 liga a cobrança ao assinar.
- Decisão a confirmar: a mensagem de falha na tela (`supabase-conversas.ts`) não está em "Pode mexer", mas o critério "falha com motivo claro" a exige.
