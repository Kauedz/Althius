# 01: Fila de entrada nas Sequências

**What to build:** A entrada na Sequência conta pela Conta e pelo remetente (`whatsapp_new_company` e o equivalente de E-mail e LinkedIn). O padrão é 20 a 25 empresas novas por dia por remetente, sorteado no dia. A capacidade do Workspace é a soma dos remetentes prontos. O excedente espera o próximo dia útil, na ordem de chegada, com a Conta Quente na frente. Remetente novo começa em 5 por dia e sobe em 14 dias. A tela mostra "X de Y hoje" e "N na fila para amanhã".

**GATE:** não editar conector, Unipile, `sender-accounts`, `unipile-account-status`, `_shared/unipile`, HubSpot, Pipedrive, Notion, nem segredo. Sem `apply_migration`. Sem `execute_sql` no remoto. Sem deploy. Sem merge. Sem SQL que apague dado de produção. Não mostrar as letras A–H dos nichos. Não escrever "CRM" na tela. Não mudar rota, menu nem layout.

**Blocked by:** nenhum.

**Status:** ready-for-human

## Pode mexer

- `supabase/migrations/20261019120000_fila_de_entrada_nas_sequencias.sql`
- `supabase/tests/fila_de_entrada_nas_sequencias.sql`
- A asserção de contagem dos tetos padrão em `supabase/tests/ritmo_de_envio.sql` (o catálogo passa de 6 para 9 kinds)
- `private.schedule_next_step`, `private.send_rate_gate` (a porta nova é chamada ao lado), `public.claim_due_step_sends`, `public.claim_due_chat_step_sends`, `private.release_step_send`, `private.release_chat_step_send`, `public.set_send_cap`
- A lista de Contas remetentes em Configurações e o topo da Sequência, com a fonte que lê a cota
- Este diretório

## Não mexa

- Conectores, Unipile, Edge Functions de conta remetente, segredos, Auth.
- O projeto remoto `ycbdilsmydvzezhlymty`.
- Migrações já aplicadas (só uma migração nova, com versão posterior a `20261018130000`).
- Estrutura do app: rotas, menus, layout.

## Critérios

- [x] Várias pessoas da mesma Conta no mesmo dia, pelo mesmo remetente, contam 1. Outra Conta conta de novo.
- [x] Remetente no dia 0 da rampa fica em 5. Aos 14 dias o teto volta à faixa 20–25, estável no dia.
- [x] O que passa do teto fica `scheduled` no próximo dia útil. Conta Quente passa na frente. Nada é cancelado.
- [x] A capacidade do Workspace é a soma dos remetentes daquele canal com status pronto. Desconectado não entra.
- [x] Configurações e o topo da Sequência mostram "X de Y hoje" e "N na fila para amanhã".
- [x] pgTAP e Vitest novos. O CI (Banco, Edge, Frontend) verde.

## Passos do Nan

**A IA que executar este ticket avisa o Kauê, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Kauê.**

1. Com o CI verde, aplicar no projeto `ycbdilsmydvzezhlymty` pelo `execute_sql`, em bloco atômico, como em `docs/agents/migrations.md`. Não usar `apply_migration`. Conferir que `md5(statements[1])` é o `md5sum` do arquivo e que os advisors não ganharam aviso novo.

   - `supabase/migrations/20261019120000_fila_de_entrada_nas_sequencias.sql`

2. Nenhuma Edge Function muda neste PR. Não publicar função.

3. A fila usa o mesmo interruptor do ritmo. Se ainda estiver desligado, no SQL Editor: `select private.set_send_rate_enabled(true);`. Não cadastrar segredo.

## Comments

- A migração `20261019120000_fila_de_entrada_nas_sequencias` não foi aplicada no projeto remoto. Nenhuma Edge Function foi publicada. O CI do PR confirma Banco, Edge e Frontend.
