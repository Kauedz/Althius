# Ralph status — early-send (CRM × Auth × Canais)
Updated: 2026-10-08 (Auth-03 fechado: (B) /termos e /privacidade, (C) aviso a quem já tem conta)
Spend cap: USD 70 (estimativa por tokens reportados pelos halves; não é o gasto real faturado)
Goal: primeiro e-mail real (canais-04). Fonte: `.scratch/ORDEM-BUILD-FUNCIONAL.md`

## Queue
| Ticket | Status | Half/PR | Notes |
|--------|--------|---------|-------|
| CRM-01 | skipped | — | closed |
| CRM-02 | skipped | — | substituído por Auth-02…08 |
| Auth-01 | skipped | — | closed (PR #18, merged) |
| Auth-02 | done | ralph/auth-02-workspace-pessoal · PR #19 (draft) | AC 7/7; pgTAP 19/19; suíte 530/530; **pending-apply** migration 20260925140000 |
| Auth-03 | done (código) | ralph/auth-03-cadastro-com-senha · PR #20 (draft, base Auth-02) | AC 7/8; suíte 540/540; 1 AC depende de e-mail para conta existente (Send Email Hook → Auth-10) |
| Auth-04 | done | ralph/auth-04-entrar-com-senha-ou-codigo · PR #21 (draft, base Auth-02) | AC 5/5; suíte 537/537 |
| Auth-05 | done | ralph/auth-05-esqueci-a-senha · PR #22 (draft, base Auth-03; inclui junção com Auth-04) | AC 5/5; suíte 552/552 |
| Auth-06 | done | ralph/auth-06-senhas-vazadas · PR #24 (draft, base Auth-05) | AC 6/6; suíte 560/560; criou `ServicosDoNavegador` |
| Auth-07 | done | ralph/auth-07-continuar-com-google · PR #26 (draft, base Auth-06) | AC 6/6; suíte 570/570; pending-human: Client ID Google (Auth-10) |
| Integração 07+08 | done | ralph/auth-integracao · PR #27 (draft, base Auth-07) | junção feita pela matriz; suíte 579/579 |
| Auth-08 | done | ralph/auth-08-captcha-invisivel · PR #25 (draft, base Auth-06) | AC 4/4; suíte 569/569; pending-human: Turnstile (Auth-10) |
| CRM-04 | done | ralph/crm-04-contas-alvo-reais · PR #28 (draft, base integração Auth) | AC 7/7; pgTAP 24/24; suíte 591/591; **pending-apply** migration 20260925150000; sem CRM-17 (responsabilidade com UUID em texto) |
| CRM-05 | done | ralph/crm-05-contatos-e-vinculos · PR #29 (draft, base CRM-04) | AC 7/7; pgTAP 36/36; suíte 602/602; **pending-apply** migration 20260925160000; pending-human: linhas antigas em `private.target_contacts_canais02` |
| CRM-17 | not-needed (até agora) | | só se a FK textual Seq↔Conta bloquear; Blocked by CRM-04 e **CRM-06 (fora do corte)** |
| canais-01 | gate-pending | — | in-progress; AC de código todos [x], falta validação com conta real |
| canais-02 | gate-fail | — | ready-for-human (AC de código todos [x]) |
| canais-03 | gate-fail | — | Blocked by canais-01 (in-progress, não done); 2 AC abertos |
| canais-04 | blocked | | Blocked by canais-02 (ready-for-human) e canais-03 |
| Review final | done | — | 0 bloqueantes; 2 importantes + 2 menores em correção |
| Correções da revisão | done | ralph/revisao-correcoes · PR #30 (draft, topo da pilha) | 4/4; pgTAP 40/40, 21/21, 24/24; suíte 604/604; vincular+editar Contato (CRM-05); enumeração pelo rate limit (Auth); aceite dos Termos só no 1º acesso; erro cru de RPC |
| Auth-03 + Auth-05 (2026-10-08) | parcial: correção (A) da raiz feita; Auth-03 segue com (B) /termos e /privacidade e (C) e-mail para conta existente; Auth-05 só falta o humano do ticket 10 | ralph/auth-03-05-redefinir-senha | link de redefinição, `/cadastro`, `/esqueci-a-senha` e link de confirmação abriam a Demonstração num navegador sem escolha; sem migration; ver seção "Auth-03/05 — 2026-10-08" |
| Auth-03 (B)+(C) (2026-10-08) | closed (código); pending-human: migration 20261008160000 e deploy da `existing-account-email` | ralph/frente-acesso · commit 435ccb0 | /termos e /privacidade públicos; aviso por e-mail a quem já tem conta (Edge Function sem JWT + RPC só de service_role, com limites); vitest 1088/1088, deno 721/721, pgTAP do zero ok; ver seção "Auth-03 (B)+(C) — 2026-10-08" |
| Auth-09 | out | — | fora do corte; exige CRM-03 |
| Auth-10 | human | — | ready-for-human; não spawnar |
| CRM-03, 16, 19, 20, 21, 22–24 | out | — | fora do corte / ponteiros |

## Parallel (max 3)
- Auth-03 ∥ Auth-04 e Auth-07 ∥ Auth-08, conforme pedido. O half seguinte (Auth-05, CRM-04) junta as duas branches e resolve conflitos.

## Spend (estimativa grosseira)
| Half | Tokens reportados |
|------|-------------------|
| Auth-02 | ~133k |
| Auth-03 | ~108k |
| Auth-04 | ~115k |
| Auth-05 | ~165k |
| Auth-06 | ~135k |
| Auth-08 | ~119k |
| Auth-07 | ~153k |
| CRM-04 | ~201k |
| CRM-05 | ~204k |
| Review | ~141k |
| Correções | ~127k |
| **Total halves** | **~1,75M** (mais a matriz) |

## Merge (2026-09-25)
Pilha mergeada na `main` pelo responsável do produto: #19, #20, #22 (traz #21), #24, #26, #27 (traz #25), #28, #29, #30. PRs #21 e #25 fechados sem merge por estarem contidos em #22 e #27. Na `main`: suíte 604/604, `tsc` ok, pgTAP de workspace_pessoal, contas_alvo_reais e contatos_e_vinculos sem falhas.

A correção do aceite dos Termos entrou como migration nova `20260925170000_bootstrap_preserva_aceite_dos_termos.sql`, porque a `20260925140000` já tinha sido aplicada no remoto.

## Auth-03/05 — 2026-10-08
- **Ticket:** Auth-03 (cadastro) incluindo Auth-05 (esqueci a senha). Bug: num navegador que nunca escolheu o Workspace operacional, o link de redefinir senha, `/cadastro`, `/esqueci-a-senha` e o link de confirmação do cadastro abriam a Demonstração.
- **Status:** parcial. Auth-05: código fechado, falta só o passo humano do ticket 10. Auth-03: correção (A) feita; seguem (B) rotas /termos e /privacidade e (C) e-mail para conta existente por Edge Function (trabalho de agente, ver Comments de 2026-10-07 no ticket).
- **Branch:** `ralph/auth-03-05-redefinir-senha`, com push, sem PR.
- **Sem migration.** Nada a aplicar no Supabase.
- **Decisão do Renan (2026-10-08): aceito como está.** Quem abre uma tela de acesso ou um convite fica com o Workspace operacional lembrado no navegador (é o que faz o link de confirmação funcionar), e quem visitou `/cadastro` vai para `/entrar` ao voltar ao início, não para a Demonstração. Descartada a alternativa `/entrar?destino=…` nos links do e-mail.
- **O que o humano roda (PowerShell, na raiz do repo):**
  1. Conferir os testes: `cd projeto-althius-frontend; npx vitest run src/raiz.test.tsx; npx tsc -b`
  2. A branch já está no GitHub. O PR fica a seu critério.
  3. Supabase Auth, pendência antiga do Auth-05 (Dashboard → Authentication → URL Configuration): `https://<domínio>/redefinir-a-senha` e os destinos dos links (`https://<domínio>/**`) nas Redirect URLs. Modelos "Confirm signup" e "Reset Password" com `{{ .Token }}` além do link.
  4. Conferência real, depois do deploy: numa janela anônima, abrir `https://<domínio>/entrar` → "Esqueci a senha" → abrir o link do e-mail na mesma janela → deve aparecer "Defina uma nova senha". Repetir com `https://<domínio>/cadastro` e o link de confirmação → deve abrir o Workspace pessoal.

## Auth-03 (B)+(C) — 2026-10-08
- **Ticket:** autenticacao-google-email 03, partes (B) e (C). Checkboxes 8/8; Status `closed`, com os Passos do Nan pendentes.
- **Branch:** `ralph/frente-acesso`, commit `435ccb0`. Sem push.
- **O que mudou:** `/termos` e `/privacidade` abrem uma página pública (`src/auth/documento-publico.tsx`), fora do login e da Demonstração. O cadastro com e-mail que já tem conta chama em silêncio a Edge Function nova `existing-account-email` (`verify_jwt = false`, responde sempre 202). Ela reserva o aviso pela RPC `claim_existing_account_notice` (migration `20261008160000_aviso_de_conta_existente.sql`) e manda o e-mail pelo Resend do Convite.
- **Testes:** vitest 1088/1088, `tsc -b` limpo, oxlint sem erros, `deno check` em todas as funções, `deno test supabase/functions` 721/721, pgTAP do zero com todas as migrations ok (`aviso_de_conta_existente.sql` 14/14).
- **Decisões a confirmar (Nan):**
  - A função não tem CAPTCHA. Os limites seguram o abuso: 3 avisos por dia por conta e 200 por hora no total.
  - A página `/termos` mostra o título "Termos de serviço", e o link diz "Termos de Uso".
  - O remetente é o mesmo do Convite (`INVITE_EMAIL_FROM`).
- **O que o humano roda (PowerShell, na raiz do repo), depois do merge e do CI verde:**
  1. Conferir os testes: `cd projeto-althius-frontend; npx vitest run src/raiz.test.tsx; npx tsc -b; cd ..; deno test supabase/functions/existing-account-email`
  2. Aplicar `supabase/migrations/20261008160000_aviso_de_conta_existente.sql` no Supabase `ycbdilsmydvzezhlymty` como manda `docs/agents/migrations.md` (um agente com o MCP do Supabase, pelo `execute_sql`).
  3. `npx supabase secrets list --project-ref ycbdilsmydvzezhlymty`: confira que `RESEND_API_KEY` e `APP_ORIGIN` aparecem.
  4. `npx supabase functions deploy existing-account-email --project-ref ycbdilsmydvzezhlymty`
  5. Conferência real: numa janela anônima, cadastrar em `https://<domínio>/cadastro` um e-mail que já tem conta confirmada. A tela pede o código como num cadastro novo, e a caixa recebe "Você já tem conta na Althius". Abrir também `/termos` e `/privacidade`.

## STOP
Corrida parada no gate de canais: canais-03 depende de canais-01 (in-progress) e canais-04 de canais-02 (ready-for-human). Aguardando decisão humana.

## Alerts
- ALERTA RALPH | migrations | aplicar no remoto, na ordem, as que faltarem: 140000 (se ainda não) → 150000 → 160000 → 170000.
- ALERTA RALPH | Auth-03 | pending-apply | aplicar `supabase/migrations/20261008160000_aviso_de_conta_existente.sql` e só depois publicar a Edge Function `existing-account-email`.
- ALERTA RALPH | PR #23 (outra sessão) | o wizard de teste real do canais-01 pode ter criado dados em `public.workspaces` no remoto; conferir se a tabela já existe antes de aplicar a 140000 (que faz `create table`).
- ALERTA RALPH | canais-03 | GATE | Blocked-by faltando: canais-01 não está done.
- ALERTA RALPH | CRM-05 | pending-apply + humano | migration 20260925160000 move a tabela antiga de destinatários (canais-02) para `private.target_contacts_canais02` e troca `public.target_contacts` por view; decidir o destino das linhas antigas, se houver.
- ALERTA RALPH | CRM-17 | GATE (antecipado) | Blocked by CRM-06 (roleta), fora do corte. Se a FK textual travar CRM-04/05/canais, a cadeia para aqui até decisão humana.
- Pendências humanas acumuladas para o Auth-10: modelos de e-mail "Confirm signup", "Magic Link" e "Reset Password" com `{{ .Token }}` além do link; e-mail para quem tenta se cadastrar com e-mail existente (Supabase não envia; exige Send Email Hook); páginas `/termos` e `/privacidade` (hoje provisórias).
- ALERTA RALPH | CRM-04 | pending-apply | aplicar `supabase/migrations/20260925150000_contas_alvo_reais.sql` depois da do Auth-02.
- ALERTA RALPH | Auth-02 | pending-apply | aplicar `supabase/migrations/20260925140000_workspace_pessoal.sql` no Supabase ANTES de mergear o PR #19; sem ela o app real cai em "Tentar novamente" após o login.
- Pré-existente: `responsabilidade_exclusiva.sql` falha 7/12 localmente também na `main` (validação de canal em `validate_sequence_document`). Relevante para canais-01/02.
- ALERTA RALPH | canais-02 | GATE | ready-for-human: não spawnar. canais-04 depende dele; a cadeia para no gate do canais-04 se o canais-02 não for dado como done por um humano.
- ALERTA RALPH | canais-01 | GATE | in-progress com AC de código completos; pendente validação com conta real (humano). Decidir se conta como done para canais-02/03/04.
- Pré-existente: `20260925100000_documento_com_destinatarios_reais.sql` e `20260925120000_contas_remetentes_unipile.sql` dependem de `20260925130153_real_sequence_access.sql` (timestamp posterior). Um `supabase db reset` do zero falha.
- Pré-existente: `contas_remetentes_unipile.sql` e `documento_com_destinatarios_reais.sql` (pgTAP) falham num Postgres limpo com `permission denied for schema private`. (`responsabilidade_exclusiva.sql`: ver alerta acima, 7/12.)

## Loop de teste de banco
Postgres 16 + pgTAP locais, com schema `auth` mínimo do Supabase, via script de sessão (fora do repo): aplica `supabase/migrations/` (repetindo as fora de ordem) e roda `supabase/tests/`.

## Auth-09 — 2026-10-08
- **Ticket:** autenticacao-google-email 09 (Entrar por convite). Checkboxes 5/5. Status `ready-for-human`: o código está fechado e falta só a conferência com o Google real.
- **Branch:** `ralph/frente-acesso`, commit `d8c3a7d`. Sem push.
- **O que mudou:**
  - Na recusa do convite por outro e-mail (sessão de senha, código ou Google), "Entrar com outra conta" sai da sessão e abre `/entrar?destino=/convite/<token>`, com o e-mail convidado travado e o Google. Se a saída falhar, a tela volta ao link do convite.
  - A volta do Google ao convite já funcionava e agora tem teste.
  - Sem migration e sem Edge Function.
- **Testes:** vermelho do "Entrar com outra conta" no código antigo; `aceite-do-convite.test.tsx` 27/27; `npx vitest run --maxWorkers=2` com 107 arquivos e 1090/1090 testes; `tsc -b` limpo. A suíte sem `--maxWorkers` foi parada por falta de memória na máquina.
- **O que o humano roda:**
  1. Conferir os testes (PowerShell, na raiz do repo): `cd projeto-althius-frontend; npx vitest run src/auth/aceite-do-convite.test.tsx; npx tsc -b`
  2. Depois do Google real do ticket 10, numa janela anônima:
     - Abrir o link de um convite pendente → "Já tenho conta: entrar" → "Continuar com Google" com uma conta de **outro** e-mail. Deve aparecer "Convite não aceito", com "Entrar com outra conta".
     - Clicar nele e escolher a conta do e-mail convidado. Deve abrir o Workspace da empresa, com o pessoal no seletor.
     - Repetir por "Criar conta com este e-mail" com o Google do e-mail convidado.

## CRM-15 (frente acesso) — 2026-10-08
- **Ticket:** crm-real-e-stack 15 (Aplicar Aprovações antes de ações externas). O critério que faltava era a fila. Checkboxes 11/11. Status `ready-for-human`: o código está fechado e faltam os Passos do Nan do ticket.
- **Branch:** `ralph/frente-acesso`, commit `10e29cf`. Sem push.
- **O que mudou:**
  - A fila `/aprovacoes` liga no Workspace operacional junto com as Conversas (`aprovacoesDisponiveis: comConversas` em `aplicativo.tsx`).
  - O Administrador decide ali a Aprovação pedida na Conversa de um Membro. O Membro vê a Aprovação e o aviso de que só um Administrador decide.
  - O número de pendentes da navegação vem da fila real.
  - A introdução da fila não promete mais decidir pelo Canal.
  - A regra de quem decide fica num lugar só (`podeDecidir` com o ambiente).
  - ADR-0010 emendada.
  - O `raiz.test.tsx` não mudou: sem o modelo, a fila segue indisponível, e a autorização de trocar aquela asserção não foi usada.
  - Sem migration, sem Edge Function e sem segredo novo.
- **Testes:** vitest `--maxWorkers=2` 109 arquivos e 1096/1096; `tsc -b` limpo; pgTAP local 58 arquivos e 2550/2550 (inclui `aprovacoes_reais` 30, `ferramentas_dos_agentes` 37 e `permissao_por_ferramenta` 30). Prints em `.scratch/crm-real-e-stack/issues/prints/15-*.jpg`.
- **Fica de fora:**
  - O cartão da fila não mostra a linha "Conta-alvo", porque `list_approvals` não traz o nome da Conta (pede migration).
  - A 360px, a casca do Workspace operacional não se adapta em nenhuma tela (já era assim).
- **O que o humano roda (PowerShell, na raiz do repo):**
  1. Conferir os testes: `cd projeto-althius-frontend; npx vitest run src/paginas/aprovacoes-reais.test.tsx src/fonte/supabase-aprovacoes-leitura.test.ts; npx tsc -b`
  2. Conferir o que já está no remoto: `npx supabase migration list --linked` e `npx supabase functions list --project-ref ycbdilsmydvzezhlymty`. O que faltar segue os passos 1, 2 e 5 do ticket. Isso vale para as migrations `20261001210000` e `20261002110000` e para o deploy de `agent-conversation`, `crm-handoff`, `integration-tools`, `integration-connect` e `integration-callback`.
  3. Depois do merge e do deploy do frontend, passo 6 do ticket:
     - Como **Membro**, com o Rhetor em Propor no HubSpot, pedir na Conversa "Rhetor, leve a <Conta sua> ao HubSpot". O passo mostra "Só um Administrador decide esta Aprovação."
     - Como **Administrador**, a navegação mostra o número de pendentes. Em `/aprovacoes`, clicar em Aprovar: o cartão vira "Aprovada · executada" e a empresa aparece no HubSpot.
