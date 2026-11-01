# 03: Execuções presas ou com falha: tela com motivo, "Tentar de novo" e Aviso de Rotina que falha seguido

**What to build:** quando uma Execução trava ou falha, hoje ninguém sabe. A Atividade real do Agente devolve lista vazia (`projeto-althius-frontend/src/fonte/supabase-agentes.ts:303-304`, "a Atividade nasce das Execuções, que ainda não existem neste Workspace"), a Execução parada só vira `timeout` quando alguém abre a Conversa (`get_agent_run_events`) ou pede outra na mesma Conversa (`start_agent_run`), e uma Rotina (ticket 01) roda sem ninguém olhando. Este ticket entrega: (1) um relógio que fecha no banco, sozinho, a Execução parada além do prazo; (2) a Atividade real das Execuções, com o motivo da falha em português e o botão **Tentar de novo**; (3) um Aviso do Workspace ao Administrador quando uma Rotina falha N vezes seguidas (o glossário reserva "Aviso do Workspace" e manda evitar "alerta"). **Não há Agente verificador**: tudo é SQL, o relógio do pg_cron e a tela, sem chamar o modelo (ADR-0001 e ADR-0004: os Agentes são os quatro fixos e a Coordenação não é um quinto).

**Blocked by:** 02: Reserva de Créditos antes de executar (o "tentar de novo" cria uma Execução nova que reserva crédito, e o `timeout` precisa soltar a reserva).

**Status:** ready-for-human (implementação e verificações locais concluídas; falta conferir o job no projeto após aplicar a migration e validar a retomada pelo cron em ambiente operacional)

## O que existe hoje (lido na `main` em 12/10/2026)

- Estados de `private.agent_runs`: `queued`, `running`, `succeeded`, `failed`; `failed` sempre tem `error_code` e um evento `falha` (`20260929180000_conversas_dos_agentes.sql:32-47`, `finish_agent_run` `:444`).
- O prazo é `private.agent_run_deadline()` = 10 minutos (`:81`), contado de `started_at` ou, na fila, de `created_at`. Só `expire_run_if_stale` (`:110`) fecha, e só é chamada por `start_agent_run` (`:236`) e `get_agent_run_events` (`:256`). Não há job: uma Execução de Rotina presa fica aberta e, pelo índice de uma Execução aberta por Conversa (`:54`), faz o cron do ticket 01 pular todos os horários seguintes.
- Os motivos que o front traduz estão em `projeto-althius-frontend/src/fonte/supabase-conversas.ts:65-83` (`timeout`, `model_*`, `membership_inactive`, `insufficient_credits`, `workspace_ai_key_*`, `hermes_unreachable`, `hermes_failed`); os do ticket 01 (`routine_paused`) e 02 (`automation_cap_reached`) entram junto. `codigoDoErro` cai em `internal_error` (`_shared/orquestracao.ts:174`).
- A Conversa é privada: "só ele a lê" (`20260929180000_conversas_dos_agentes.sql:9`). A Execução de Rotina não é de uma conversa pessoal: a Conversa dela é do dono da Rotina por construção (ticket 01).
- A aba Atividade existe como tela: `src/paginas/secoes/atividade.tsx` filtra por `Gatilho` e usa `fonte.atividade(agenteId, gatilho)`; o tipo e os rótulos já conhecem `rotina` (`src/fonte/tipos.ts:338`, `src/paginas/rotulos.ts:3`).
- Avisos do Workspace: `private.workspace_notices` e `list_workspace_notices` (`20260930170000_interruptores_e_tetos.sql:8`, `:218`), com um Aviso por evento e o link para a tela. A entrega do Aviso como notificação do navegador depende de `configuracoes/issues/07-notificacoes-web.md`, que já registra: "uma falha de Rotina ou de Canal precisaria de" um destinatário definido (linha 49).
- O glossário (`CONTEXT.md`, "Aviso do Workspace") já diz que o Aviso sai "quando uma Aprovação é pedida ou decidida ou uma Execução falha", e vai só a quem diz respeito pela Participação e pelo papel. Hoje a tabela só aceita `kind = 'teto_atingido'` (`check (kind in ('teto_atingido'))`, `20260930170000_interruptores_e_tetos.sql:12`).

## Desenho

- **Relógio.** `private.expire_stale_agent_runs()` percorre as Execuções `queued`/`running` vencidas e chama `expire_run_if_stale` em cada uma, no pg_cron a cada 5 minutos (`althius-stale-agent-runs`, só onde o pg_cron existe). O motivo distingue "ninguém pegou o pedido" (estava `queued`: motor fora do ar) de "o motor parou no meio" (estava `running`): `timeout_queued` e `timeout_running`, sem mexer em `timeout`, que continua valendo para o que já foi gravado. `expire_run_if_stale` já solta a reserva (ticket 02).
- **Leitura.** `public.list_agent_run_attention(p_workspace_id uuid, p_agent_id uuid default null)`: as Execuções do Agente (ou do Workspace) dos últimos 14 dias, com `trigger_kind`, `routine_id`, `status`, `error_code`, `finished_at` e o `retried_by`. Quem vê: o dono vê as da própria Conversa; o Administrador vê as de **Rotina** do Workspace (a tarefa é configuração do Workspace, não conversa pessoal). O Administrador **não** lê `request_text` nem eventos de Conversa de outra pessoa.
- **Tentar de novo.** `public.retry_agent_run(p_run_id uuid, p_client_request_id uuid)`: só para Execução `failed`, só para quem pode ver aquela Execução, devolve uma Execução nova `queued` na mesma Conversa (mesmo texto, `retry_of` apontando para a original), idempotente pelo `client_request_id`. Não vale para `membership_inactive` (a pessoa saiu) nem se já houver Execução aberta na Conversa (`conversation busy`). A original continua `failed` no histórico; o crédito segue as regras do ticket 02.
- **Aviso.** Um gatilho `after update` em `private.agent_runs` quando uma Execução com `trigger_kind = 'rotina'` vira `failed` conta as falhas seguidas da mesma Rotina (um `succeeded` zera). Ao chegar em N (padrão 3, `private.routine_failure_alert_threshold()`), grava **um** Aviso do Workspace (`kind = 'rotina_falhando'`, o que exige trocar o `check` de `kind` da tabela, com o motivo da última falha e o link para a Atividade) e não repete até a Rotina ter sucesso ou ser retomada. Não conta `routine_paused`, `membership_inactive`, `insufficient_credits` nem `automation_cap_reached`/`teto_atingido`: esses têm Aviso próprio ou não são falha da Rotina. Não pausa a Rotina sozinho.
- **Tela.** A aba Atividade passa a listar as Execuções reais do Agente com o gatilho e o resultado; a falha mostra o motivo em português e "Tentar de novo"; a presa mostra "Parada há N minutos" até o relógio fechá-la. A Fonte `atividade` deixa de devolver `[]` no modo real. Na Demonstração não muda nada.

## Critérios

- [x] Execução `running` com `started_at` há mais de 10 minutos e Execução `queued` com `created_at` há mais de 10 minutos viram `failed` pelo job, sem ninguém abrir a Conversa, com `timeout_running` e `timeout_queued`, um evento `falha` e `finished_at`. Uma Execução de 9 minutos não é tocada. (pgTAP 25/25)
- [ ] O job é idempotente (rodar duas vezes não cria dois eventos `falha`) e, onde existe o pg_cron, `althius-stale-agent-runs` existe com `*/5 * * * *`. Idempotência verificada no pgTAP; conferir `cron.job` no ambiente após aplicar a migration: pendente verificação humana.
- [ ] Depois do relógio fechar a Execução presa de uma Rotina, o cron do ticket 01 volta a criar a do horário seguinte. Conferir em ambiente operacional com o worker ativo: pendente verificação humana.
- [x] `list_agent_run_attention`: o dono vê a própria Execução com o motivo; outro Membro não vê; o Administrador vê as de Rotina do Workspace e **não** vê o `request_text` de uma Conversa pessoal de outra pessoa; um Workspace nunca vê o de outro. Conferido na função (filtro por Workspace, dono e papel) e no pgTAP para a visibilidade de Administrador e Membro.
- [x] `retry_agent_run` cria uma Execução `queued` na mesma Conversa com o mesmo texto e `retry_of`; chamar de novo com o mesmo `client_request_id` devolve a mesma; numa Execução `succeeded`, `running`, `queued` ou `membership_inactive` recusa; com outra Execução aberta na Conversa devolve `conversation busy`. Conferido na RPC e no pgTAP (idempotência, fila, membership_inactive e conversa ocupada).
- [x] Quem não vê a Execução não consegue tentar de novo (recusa com `42501`), inclusive o Administrador numa Conversa pessoal de outra pessoa. Conferido na guarda de autorização da RPC e no pgTAP para Membro; a Atividade não lista a conversa pessoal para Administrador.
- [x] Tentar de novo uma Execução que falhou por `insufficient_credits` com saldo ainda insuficiente cria a Execução, que falha de novo na porta (ticket 02) sem reservar nada nem chamar o modelo. A RPC só enfileira; o claim e a falta de reserva/execução do modelo estão cobertos pelo ticket 02 (`reserva_de_creditos_na_execucao.sql`, 89/89).
- [x] Rotina com 3 falhas seguidas gera exatamente um Aviso `rotina_falhando` para os Administradores (`list_workspace_notices`); a 4ª falha não gera outro; um sucesso zera a contagem; falhas por teto ou por crédito não contam; a Rotina de outro Workspace ou outra Rotina do mesmo Agente tem contagem própria. Verificado no pgTAP e na chave por `routine_id` da tabela de estado.
- [x] Nenhum caminho novo chama o modelo, cria linha em `private.agents` ou registra evento com `agent_id`: pgTAP confere que `agents` não mudou; as novas RPCs são SQL e não alteram o worker.
- [x] Vitest: a Atividade lista a Execução de Rotina que falhou com o motivo traduzido e o botão; o botão some em `membership_inactive`; clicar chama `retry_agent_run` uma vez e mostra a Execução nova; a lista vazia mostra o estado vazio, nunca uma falha inventada. Testes da Fonte e da tela passaram.
- [x] Todo motivo novo (`timeout_queued`, `timeout_running`, `routine_paused`, `automation_cap_reached`) tem texto em português em `supabase-conversas.ts`, e um código desconhecido continua caindo na frase genérica. Conferido no mapa de mensagens e nos testes existentes de teto/código desconhecido.

## Pode mexer

- Uma migration nova, com timestamp UTC maior que a última da `main`, e um pgTAP novo: `supabase/tests/execucoes_presas_ou_com_falha.sql`.
- `private.agent_runs` (coluna `retry_of`), `private.expire_run_if_stale` (os dois motivos novos, redefinida a partir da definição mais recente), o gatilho e as funções novas acima.
- `projeto-althius-frontend/src/paginas/secoes/atividade.tsx`, `src/fonte/supabase-agentes.ts` (`atividade`) e `src/fonte/supabase-conversas.ts` (os motivos), com testes novos.

## Não mexa

- Em `append_agent_run_event`, `claim_agent_run` e `finish_agent_run` além do que os tickets 01 e 02 já fizeram.
- Em `supabase/functions/_hermes-worker/` e `agent-conversation/`: o relógio é do banco.
- Em testes existentes: um ticket só acrescenta testes (`conversas_dos_agentes.sql` afirma o comportamento do `timeout` na leitura).
- Em `list_workspace_notices` e na tela de Avisos: o ticket só grava o Aviso.
- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Não cria Agente nem rotina que use modelo para "revisar" Execuções.

## Arquivos compartilhados com a área do Renan

- `20260930170000_interruptores_e_tetos.sql`: `private.workspace_notices` e `list_workspace_notices`. O `check` de `kind` aceita só `teto_atingido`: a migration troca a restrição (aditiva, acrescentando `rotina_falhando`) e confere se `list_workspace_notices` filtra por `kind`. A tabela e o Aviso de teto são da frente de créditos.
- `.scratch/configuracoes/issues/07-notificacoes-web.md`: o destinatário de uma falha de Rotina é a pergunta que o próprio ticket deixou aberta.
- `projeto-althius-frontend/src/fonte/supabase-conversas.ts` (a tabela de motivos, a mesma dos tickets de créditos) e `supabase-agentes.ts`.
- `private.agent_runs` e as funções do contrato (`claim_agent_run`, `finish_agent_run`, `expire_run_if_stale`) compartilhadas com os tickets 01 e 02 e com `agentes-em-conversa`.
- `supabase/tests/conversas_dos_agentes.sql` e `creditos_das_execucoes_de_agentes.sql`: só leitura.

## Dúvidas para o Renan

1. **Quem recebe o Aviso de Rotina que falha seguido?** `list_workspace_notices` só devolve a Administrador (`return` vazio para os outros, `20260930170000_interruptores_e_tetos.sql:226-228`). Padrão proposto: manter assim, todos os Administradores ativos, sem push até a notificação do navegador existir; o dono da Rotina que não é Administrador vê a falha na Atividade, mas não recebe Aviso.
2. **N = 3 serve?** Padrão proposto: 3, constante no banco; um Administrador configurar o N fica para depois.
3. **O Aviso deve pausar a Rotina?** O pedido é só alertar. Padrão proposto: não pausar; a Rotina continua gastando teto a cada horário, o que o teto do ticket 01 limita. Se preferir pausar na 5ª falha, é um ticket pequeno depois.
4. **O Administrador pode tentar de novo uma falha de Rotina que o dono criou?** Padrão proposto: sim, para Rotina; para Conversa pessoal, só o dono.
5. **O prazo de 10 minutos serve para uma Rotina?** Uma Rotina pode ser mais pesada que uma pergunta. Padrão proposto: o mesmo prazo; mudar `agent_run_deadline` por gatilho é outro ticket.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Aplicar a migration conforme `docs/agents/migrations.md`, com o CI verde e antes do merge. Conferir que `althius-stale-agent-runs` aparece em `cron.job`.
2. Nada a publicar: nenhuma Edge Function muda.
3. Conferência com o worker desligado: criar um pedido, esperar mais de 10 minutos e abrir a Atividade do Agente. Deve aparecer "ninguém pegou o pedido" com **Tentar de novo**. (A conferência visual no navegador é trabalho da IA, com prints em `.scratch/orquestracao/issues/prints/`; o Nan só desliga e liga o worker.)

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.


## Comments

- 2026-10-25 — Adotado o padrão proposto para as decisões em aberto: Aviso só para Administradores ativos; N = 3; a Rotina não é pausada automaticamente; Administrador pode tentar de novo uma Execução de Rotina; prazo de 10 minutos. O Aviso não cria notificação do navegador.
- 2026-10-25 — Implementado o relógio SQL, leitura das Execuções na Atividade, tradução dos motivos, tentativa idempotente e Aviso de falha seguida. Verificações locais: pgTAP completo verde; Vitest direcionado verde (4/4); `npm run lint` e `npx tsc -b` verdes. O Vitest completo teve 2.001 aprovados, 4 ignorados e uma falha em `configuracoes/personas.test.tsx` (arquivo não alterado); esse arquivo passou isoladamente (11/11). Pendem os dois critérios operacionais acima.
