# Ralph status: consolidado das frentes (2026-10-08)

## Cascatas — confiabilidade (DOU, ESG, custo, CNPJ novo, amostra) (2026-10-14)

- **Tickets:** `.scratch/cascatas-confiabilidade/issues/01` a `05`
- **Status:** ready-for-human (código e Deno verdes; falta o Nan aplicar a migração e publicar as funções, com o CI verde)
- **Branch:** `cursor/cascatas-confiabilidade-2a0f`
- **O que muda:** data do DOU em `dd/mm/aaaa` com ISO de reserva; meta ESG em lotes de 10 com prazo e cursor; custo do run lido de `usageTotalUsd`; CNPJ novo para em 25 empresas e US$ 0,20; amostra de validação nas cascatas de Conta que descartam a empresa antes do casamento.
- **Migração nova (não aplicar daqui):** `supabase/migrations/20261015130000_teto_do_cnpj_novo.sql`. Sem deploy. Sem escrita no projeto remoto. Sem segredo.
- **Testes (2026-10-14):** `deno check supabase/functions/*/index.ts` limpo. `deno test supabase/functions` 1372 passed / 0 failed / 34 ignored. Com `--allow-read`, mapa + icp-c + icp-g + icp-h: 77 passed / 0 failed. pgTAP `teto_do_cnpj_novo.sql` (`plan(4)`) não rodou aqui.
- **O que o humano roda, depois do CI verde:** aplicar essa migração no `ycbdilsmydvzezhlymty` pelo `execute_sql` em bloco atômico (`docs/agents/migrations.md`) e publicar `signal-cascade` e `signal-runner`. Comandos no ticket 04, seção Passos do Nan. Não marcar cascata como disponível.

## Sinais em cascata — cache das fontes e segunda passagem (2026-10-13)

- **Ticket:** `.scratch/sinais-cascata/issues/16-cache-fontes-e-segunda-passagem.md`
- **Status:** ready-for-human (código e Deno verdes; falta o Nan aplicar a migração e publicar as funções, com o CI verde)
- **Branch:** `cursor/cache-fontes-e-validacao-5fcf`
- **PR:** https://github.com/Kauedz/Althius/pull/197 (rascunho; não mergear daqui)
- **O que muda:** cópia mensal da estatística de comércio exterior e da lista de consumidores livres; espera 10/20/40 s e execução `adiado` sem crédito; CSV oficial do mesmo recurso quando a busca da lista bloqueia; `validacao: true` compara a fotografia na hora. O relógio diário, onde o agendador existe, pede o aquecimento ao `signal-runner`.
- **Migração nova (não aplicar daqui):** `supabase/migrations/20261015120000_cache_de_fontes_e_execucao_adiada.sql`. Sem deploy. Sem escrita no projeto remoto.
- **Testes (2026-10-13):** o job Banco falhou ao aplicar `20261014200000` porque `begin_cascade_run` foi criada de novo (`42723`, a função já existia). A correção troca por `create or replace` e renomeia o arquivo para depois de `20261015110000`.
- **O que o humano roda, depois do CI verde:** aplicar essa migração no `ycbdilsmydvzezhlymty` pelo `execute_sql` em bloco atômico (`docs/agents/migrations.md`) e publicar `signal-cascade` e `signal-runner`. Comandos no ticket, seção Passos do Nan. Não marcar cascata como disponível.

## Sinais em cascata — Monitoramento no cartão e Sinais de mercado (2026-10-13)

- **Ticket:** `.scratch/sinais-cascata/issues/16-monitoramento-e-sinais-de-mercado.md`
- **Status:** ready-for-human (código e Vitest verdes; falta o Nan aplicar a migração e publicar o frontend, com o CI verde)
- **Branch:** `cursor/monitoramento-e-sinais-de-mercado-2567`
- **PR:** https://github.com/Kauedz/Althius/pull/195 (não mergear daqui)
- **O que muda:** cartão de cascata `available` de Conta ganha "Criar Monitoramento" e abre o fluxo já preenchido (ICP do Workspace, modo da varredura, limite de créditos), gravando por `save_signal_monitor`. Cartão em teste ou sem fonte continua só com o motivo. Cartão de Mercado abre "Ver Sinais de mercado", lido por `list_market_signals_for_workspace_icp` (só id, tipo, nome, frase e data; e-mail, CPF, telefone e nome de fornecedor na frase viram "Sinal de mercado registrado."). No celular a barra fica só com os ícones e o miolo encolhe, então o cartão deixa de nascer a ~62 px.
- **Migração nova (não aplicar daqui):** `supabase/migrations/20261014180000_sinais_de_mercado_na_tela.sql`. Sem deploy de função. Sem escrita no projeto remoto.
- **Testes (2026-10-13):** vermelho primeiro nos três arquivos do ticket. Verde: suíte do frontend, 139 arquivos / 1252 testes. `npx tsc -b` exit 0. pgTAP `sinais_de_mercado_na_tela.sql` (`plan(14)`) não rodou aqui. No Chrome, cartão de Sinais a 390 px mede 290 px, sem rolagem horizontal.
- **O que o humano roda, depois do CI verde:** aplicar essa migração no `ycbdilsmydvzezhlymty` pelo `execute_sql` em bloco atômico e publicar o frontend. Comandos no ticket, seção Passos do Nan. Não mergear daqui.

## Sinais em cascata — validação de produção de 13/10/2026

- **Ticket:** `.scratch/sinais-cascata/issues/15-validacao-de-produccao-2026-10-13.md`
- **Status:** ready-for-human (código e Deno verdes; falta o Nan aplicar as migrações, cadastrar os segredos e publicar as funções, com o CI verde)
- **Branch:** `cursor/validacao-producao-sinais-6455`
- **PR:** https://github.com/Kauedz/Althius/pull/194 (não mergear daqui)
- **O que muda:** rodízio `APIFY_TOKEN_1`..`APIFY_TOKEN_5` mais o legado, com espera persistida; CNPJ em lotes de 5 e BrasilAPI no TIMED-OUT; espera de 429 na NCM; vaga de logística só consulta página de Conta e pula o CNPJ perto do prazo; meta ESG aceita domínio da marca; frase "Sinais novos gravados". DOU aceita data dd/mm/aaaa num trecho mais curto que a janela pedida e tira a busca longa das reservas. Cooperativa abre a janela para cerca de 120 dias (ou o mês de referência da base) e não chama a outra base quando a recusa é só o atraso. Na validação, a execução guarda até 5 CNPJs sem Conta.
- **Migração nova (não aplicar daqui):** `supabase/migrations/20261014150000_rodizio_das_contas_de_coleta.sql`, `20261014160000_dou_sem_busca_longa.sql`, `20261014170000_amostra_de_validacao.sql`. Sem deploy. Sem escrita no projeto remoto. Segredos novos: `APIFY_TOKEN_1` a `APIFY_TOKEN_5`. Manter `APIFY_TOKEN` (a foto de Contato ainda o lê).
- **Testes (2026-10-13):** vermelho primeiro (itens 0–5: 14 falhas, inclusive "Sinalis"; itens 6–8: 8 falhas). Verde: `deno check supabase/functions/*/index.ts` limpo; `deno test supabase/functions` 1324 passed / 0 failed / 32 ignored. pgTAP novo não rodou aqui (sem Postgres); o job Banco do CI executa `supabase/tests/rodizio_das_contas_de_coleta.sql` (16 asserts) e `supabase/tests/amostra_de_validacao.sql` (8 asserts).
- **O que o humano roda, depois do CI verde:** aplicar a migração no `ycbdilsmydvzezhlymty` (a `20261014140000` antes, se ainda não estiver), cadastrar `APIFY_TOKEN_1`..`APIFY_TOKEN_5` no terminal sem colar no chat, e publicar `signal-cascade`, `signal-runner`, `signal-scan`, `account-discovery` e `account-enrichment`. Comandos no ticket, seção Passos do Nan. Não marcar cascata como disponível.

## Sinais em cascata — fontes reprovadas no teste real (2026-10-13)

- **Ticket:** `.scratch/sinais-cascata/issues/14-fontes-que-os-testes-reais-reprovaram.md`
- **Status:** ready-for-human (código e testes verdes; falta o Nan aplicar a migração e publicar as funções)
- **Branch:** `cursor/fontes-cascatas-corrigidas-121e`
- **PR:** https://github.com/Kauedz/Althius/pull/193 (não mergear daqui; o merge, quando for, é commit de merge)
- **O que muda:** DOU (monitor como principal, frase exata, reserva também quando o resultado não confere), Grupo A cativo (Sinal marcado se a lista pública não responder), nova cooperativa (ativa, recente, CNAE do agro), CNPJ novo (descarta MEI e empresário individual antes do Sinal).
- **Migração nova (não aplicar daqui):** `supabase/migrations/20261014140000_fontes_das_cascatas_corrigidas.sql`. Sem deploy. Sem escrita no projeto remoto.
- **Testes (2026-10-13):** `deno test supabase/functions` 1303 passed / 0 failed / 32 ignored. Com `--allow-read`, icp-c e icp-h 41/41. pgTAP local (`pgtap_fontes`): `cascatas_fontes_corrigidas` 16/16, `cascatas_icp_c` 22/22, `cascatas_icp_e` 31/31, `cascatas_icp_h` 24/24, `cascatas_icp_d` 21/21, `cascatas_icp_b` 21/21.
- **O que o humano roda, depois do CI verde:** aplicar essa migração no `ycbdilsmydvzezhlymty` pelo `execute_sql` em bloco atômico (`docs/agents/migrations.md`) e publicar `signal-cascade` e `signal-runner`. Comandos no ticket, seção Passos do Nan. Não marcar as cascatas como disponíveis.

## Revisão do aplicativo inteiro — 2026-10-10

Referência atual desta auditoria: main `04c1d18` (inclui #168–#171), branch `review/app-completo`. Os registros abaixo são históricos e não comprovam o estado operacional atual.

- Relatório: [review-app-completo.md](review-app-completo.md); inventário de [212 tickets](review-tickets-audit.md), com evidência e lacuna por ticket; anexos [frontend](review-frontend-audit.md) e [backend](review-backend-audit.md).
- Contagem estática: 115 entregues no escopo código/demo ou encerrados administrativamente; 44 parciais; 36 pendentes; 17 bloqueados. Não converter essa contagem em funcionalidades prontas em produção.
- P1 confirmado: e-mail v1 não suporta as leituras exigidas para continuação, reconciliação e resposta aprovada. #171 implementa `in_reply_to`, mas falta prova de resposta real ligada. Log temporário permanece. WhatsApp/LinkedIn exigem ciclo pela Sequência; Instagram não consta no contrato do app.
- Onboarding CRM24 segue decisão de produto; créditos05/Plano estão incompletos. Hermes implementado, disponibilidade VPS não observada. CRM11 é parcial: agendador salva last_error; falta trilha persistida/correlacionada das execuções externas.
- Deno nesta revisão: 979 passed / 0 failed / 2 ignored; check exit0; teste sem-base-fixa 2/2. pgTAP local bloqueado: CLI/Docker/Postgres indisponíveis. Frontend e vulnerabilidades: resultados finais no relatório, sem alegar CI verde a partir de API vazia.
- Complemento CI do PR172 no commit358b3cd: **todos os jobs verdes**; banco do zero77 arquivos/2998 testes, Vitest126 arquivos/1200 testes, funções979+2 testes, lint e build. Run38023853539. Lint/build/Deno locais verdes; Vitest local encerrado após sucesso na CI, sem conclusão local. Atualização final apenas documental pode disparar nova rodada. Resultado de CI não comprova deploy remoto.
- PR163/165: candidatos a fechar por entrega incorporada ao #167; PR164 candidato documental para15/16, conciliando texto obsoleto e status17. PR48/149 candidatos por superação após preservar diferenças residuais. Nenhum PR antigo fechado ou mergeado nesta revisão.
- Produção foi relatada pelo usuário; nenhuma migration/deploy/segredo remoto inspecionado ou alterado. Navegador público mostrou Demonstração e login; fluxos autenticados não foram validados.

Nenhum ticket individual teve seu estado alterado automaticamente. Pendências do Nan/Kauê, decisões e critérios novos estão no relatório. Não implementar novamente tickets já entregues; completar os gates faltantes com evidência.

Cada frente (acesso, canais, enriquecimento, creditos) tem sua secao abaixo.

## Frente enriquecimento

Updated: 2026-10-08

## Atual

| Campo | Valor |
| --- | --- |
| Ticket | prospeccao-funcional B1 |
| Status | ready-for-human |
| Branch | ralph/frente-enriquecimento |
| Commit | 861661459b2dd94c07890352a32d783adcddee44 |
| O que o humano roda | O preço já está decidido (1 crédito). Com o CI verde, aplicar `20261008203000_consulta_cnpj_reserva_credito.sql` no projeto `ycbdilsmydvzezhlymty` pelo `execute_sql` em bloco atômico, como em `docs/agents/migrations.md`. Não aplicar antes do CI. Sem push. Depois, na raiz do repositório, no PowerShell, sem `--no-verify-jwt`: `npx supabase functions deploy account-enrichment --project-ref ycbdilsmydvzezhlymty`. O pgTAP `plan(19)` não rodou nesta máquina. |

B4 estava gravado como done. Corrigido para ready-for-human: a migration `20261008153000_apagar_conta_limpa_dado_pessoal.sql` ainda é passo humano no mesmo projeto, pelo `execute_sql`, depois do CI. Sem deploy de função. Sem push.

Próximo da fila, numa sessão nova: prospeccao-funcional B2. Não reabrir o B1: o código está fechado.

## Histórico early-send (2026-09-25)

# Ralph status — early-send (CRM × Auth × Canais)
Updated: 2026-09-25T20:35-03:00
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
## Frente canais — 2026-10-08

| Campo | Valor |
|---|---|
| Ticket | prospeccao-funcional C1 — Ativar pela tela uma Sequência de WhatsApp ou LinkedIn |
| Status | done |
| Branch | ralph/frente-canais |
| Commit | b7fedae175f2e573226e8aaa99115a56e77a8a27 |
| Push | não feito |

O que o humano roda: nada no banco. Não há migration. A tela lê `list_enabled_chat_channels`, que já existe. O padrão do banco deixa WhatsApp e LinkedIn desligados; este ticket não liga o canal. Sem push.

## Frente canais — ticket 13 — 2026-10-08

| Campo | Valor |
|---|---|
| Ticket | canais-cadencia-backend 13 — Tirar o InMail da tela e recusá-lo no envio |
| Status | ready-for-human |
| Branch | ralph/frente-canais |
| Commit | 74bcb2ced4d7d872f121526180eeab1b24f949ca |
| Push | não feito |

Para o próximo agente: não reabra o 13. O código está neste commit, os oito checkboxes estão ticados e os testes já nascem verdes. `ready-for-human` aqui é o passo do Nan, não trabalho de implementação. Não marque o ticket como blocked por falta de vermelho. O próximo da fila é prospeccao-funcional C3.

O que o humano roda, antes de publicar: no SQL Editor, só leitura, a consulta do ticket (Sequências com passo de InMail). Depois do merge, na raiz do repositório: `npx supabase functions deploy sequence-runner --project-ref ycbdilsmydvzezhlymty`. Nenhuma migration e nenhum segredo novo.

Correção de vocabulário neste registro: o Status do prospeccao-funcional C1 passou de `done` para `closed`. Não sobra passo humano de migration nem de deploy nesse ticket. A seção do C1 acima fica como o registro da manhã.

Suítes: `npm test` no frontend, exit 0, 109 arquivos e 1085 testes. `deno test supabase/functions`, exit 0, `ok | 710 passed | 0 failed`. pgTAP não rodou: sem CLI e sem Docker, e este ticket não muda SQL.

## Frente canais — C3 — 2026-10-08

| Campo | Valor |
|---|---|
| Ticket | prospeccao-funcional C3 — O titular vê as respostas de WhatsApp e LinkedIn |
| Status | closed |
| Branch | ralph/frente-canais |
| Commit | ba61a0738cc0113d3dd422f98863c7d321a7c3bc |
| Push | não feito |

Para o próximo agente: não reabra o C3. Os seis checkboxes estão ticados. Não há migration nem deploy. Os canais 08 e 09 dependem do envio real do 06/07 (humano). Ao chegar neles, confira o Blocked by; se o bloqueio seguir, marque BLOCKED e pare. Esta sessão para no C3.

O que o humano roda: nada no banco. Não há migration. A tela lê `list_received_chat_messages`, que já existe. Sem push.

Suíte: `npx vitest run --maxWorkers=2` em `projeto-althius-frontend`, exit 0, 110 arquivos e 1090 testes. `npx tsc -b --pretty false`, exit 0. pgTAP não se aplica: este ticket não muda SQL.
## enriquecimento — B2 (2026-10-08)

| Campo | Valor |
| --- | --- |
| Ticket | prospeccao-funcional B2 |
| Status | ready-for-human |
| Branch | ralph/frente-enriquecimento |
| Commit | b99a2d6b2031f4eb4f2988e8de98203f42939fe7 |
| O que o humano roda | Com o CI verde, aplicar no projeto `ycbdilsmydvzezhlymty` pelo `execute_sql`, em bloco atômico (`do $apply$` / `$m$`, porque o arquivo usa `$$`), como em `docs/agents/migrations.md`. Ordem, se ainda faltarem: `20261008153000_apagar_conta_limpa_dado_pessoal.sql` (B4), `20261008203000_consulta_cnpj_reserva_credito.sql` (B1), depois `20261008223000_persona_do_contato_no_comite.sql` (B2). Não aplicar antes do CI. Sem push. Depois, na raiz do repositório, no PowerShell, sem `--no-verify-jwt`: `npx supabase functions deploy account-enrichment --project-ref ycbdilsmydvzezhlymty`. O pgTAP `plan(16)` não rodou nesta máquina. Vitest: 108 arquivos, 1075 passed. |
## Frente créditos — creditos-e-planos 01 — 2026-10-08

| Campo | Valor |
|---|---|
| Ticket | `.scratch/creditos-e-planos/issues/01-medir-o-custo-real.md` (Medir o custo real de cada ação) |
| Status | ready-for-human (código fechado; faltam a migration e a publicação das funções) |
| Branch | `ralph/frente-creditos`, sem push |
| Commit | `81aa8ed` |
| O que mudou | As Propostas de resposta gravam o modelo e os tokens de cada chamada ao modelo (`record_reply_proposal_cost`, tipo `reply_proposal` em `private.action_costs`, estimativa no `get_cost_report`). Testes Deno novos do custo no `signal-runner` e no `account-discovery`. A execução cuja leitura de custo no Apify falha é gravada com o valor em branco (`_shared/apify-ambiente.ts`, vale para `signal-runner` e `signal-scan`). |
| Testes | vermelho e verde registrados no ticket; `deno test --allow-all supabase/functions` 724/724; pgTAP do zero 58 arquivos, 2546/2546 (`custo_das_propostas_de_resposta.sql` 10/10); vitest `--maxWorkers=2` 107 arquivos, 1074/1074; `tsc -b` limpo. Sem tela nova, sem prints. |
| O que o humano roda | 1. Com o CI verde, logo antes do merge, aplicar `supabase/migrations/20261008233000_custo_das_propostas_de_resposta.sql` no projeto `ycbdilsmydvzezhlymty` pelo `execute_sql`, em bloco atômico, como em `docs/agents/migrations.md` (ela tira e põe de volta o `check` de `action_type` só para aceitar `reply_proposal`; nenhuma linha sai). 2. Depois, na raiz do repositório, no PowerShell: `npx supabase functions deploy reply-proposal-runner signal-runner signal-scan --project-ref ycbdilsmydvzezhlymty`. |
| Decisões em aberto (Nan) | Com a chave de IA do cliente, o custo sai igual ao do modelo da Althius, sem dizer quem pagou (a Execução de Agente já era assim); a chamada com reserva vencida não grava custo, só o log. Detalhes nos Comments do ticket. |

## Frente canais — 08 — 2026-10-08

| Campo | Valor |
|---|---|
| Ticket | canais-cadencia-backend 08 — Gerar Propostas de resposta privadas (parte de chat) |
| Status | blocked |
| Branch | ralph/frente-canais |
| Commit | este registro (só o ticket e o RALPH-STATUS; nenhum código) |
| Push | não feito |

Bloqueado pelo aviso 4 do CTO. O 08 de chat espera o envio real do 06 (WhatsApp) e do 07 (LinkedIn). Os dois seguem `ready-for-human`. Também falta a decisão sobre o Seam de Canal. Não houve vermelho nem código. O 09 depende do 06, do 07 e do 08, então a fila da frente canais fica vazia até o Nan desbloquear.

O que o humano roda: os Passos do Nan dos tickets 06 e 07. São eles: conectar a Conta remetente, recadastrar o webhook com `message.new` (`bash scripts/wizard-unipile.sh`), ligar o canal com `select private.set_chat_channel_enabled('whatsapp', true);` e `select private.set_chat_channel_enabled('linkedin', true);`, enviar um teste e responder. Depois, marcar o 06 e o 07 e voltar o 08 para `ready-for-agent`. Nenhuma migration e nenhum deploy saem deste registro.

## Frente créditos — creditos-e-planos 03 — 2026-10-08

| Campo | Valor |
|---|---|
| Ticket | `.scratch/creditos-e-planos/issues/03-interruptores-e-tetos.md` (Interruptores "confirmar ou automático" e tetos) |
| Status | ready-for-human (código fechado; faltam a migration e a publicação do `reply-proposal-runner`) |
| Branch | `ralph/frente-creditos`, sem push |
| Commit | `c4f3423` |
| O que mudou | Decisões do Renan de 08/10/2026. A primeira geração da Proposta de resposta só roda com Execuções de Agentes **e** o Rhetor em automático, com teto, e soma a rodada aos dois (`consume_reply_proposal_cap`); a que falha devolve (`refund_reply_proposal_cap`). Barrada, a proposta mostra o motivo e "Gerar resposta", e o clique do titular não passa pelo teto. Enriquecimento, Integrações e os outros Agentes ficam travados em confirmar: o banco recusa ligar o automático deles, a página os mostra travados (`list_runnable_automation_scopes`) e o automático já gravado volta a confirmar. Teste das Permissões dos Agentes na página. |
| Testes | Vermelho e verde registrados no ticket. pgTAP do zero com 59 arquivos e 2577/2577 (`teto_das_propostas_de_resposta.sql` 31/31). `deno test --allow-all supabase/functions` 727/727; `deno check` limpo. Vitest `--maxWorkers=2` com 112 arquivos e 1082/1082; `tsc -b` limpo; lint com saída 0. Prints em `.scratch/creditos-e-planos/issues/prints/03-*.jpg`. |
| O que o humano roda | 1. Com o CI verde, depois do merge (a `20261008233000` do ticket 01 vai antes), na raiz do repositório, no PowerShell: `git checkout main; git pull; npx supabase db push`, para aplicar `supabase/migrations/20261009010000_teto_das_propostas_de_resposta.sql` no projeto `ycbdilsmydvzezhlymty`. Ou pelo `execute_sql`, em bloco atômico, como em `docs/agents/migrations.md`. 2. Só depois dela: `npx supabase functions deploy reply-proposal-runner --project-ref ycbdilsmydvzezhlymty`. 3. Saber que, depois disso, nenhuma Proposta de resposta sai sozinha até um Administrador ligar Execuções de Agentes e o Rhetor em Automático, com teto, em Configurações › Automação e tetos. |
| Decisões em aberto (Nan) | O custo antes do clique (história 4 da spec) não está nos critérios deste ticket, e "Gerar resposta" não mostra o custo. O enriquecimento-em-cascata 02 libera o Enriquecimento redefinindo `private.automation_scope_runs`. |

## PR unificado — 2026-10-09

| Campo | Valor |
|---|---|
| Branch | `ralph/unificado-2026-10-09` (a partir da `main` 7929a2b), com push; sem PR aberto |
| Branches | B3 (#153), enriquecimento 01, S1, créditos 03, CRM-10, Conexões 08, Conexões 31 (`conexoes/ajustes-catalogo-logos-desabilitar`), agentes 02, nesta ordem, `--no-ff` |
| Tickets | todos `ready-for-human`; o enriquecimento 03 segue `ready-for-agent` |
| Decisões do Renan | CRM-10: as 5 decisões aceitas (troca de 2 FKs e recriação de `list_signal_monitors`). Agentes 02: tokens de cache do Hermes fora da contagem |
| Testes | tsc 0, lint 0 erros/50 avisos, deno test 781/781, deno check limpo, pgTAP do zero 69 arquivos 2783/2783, vitest 121 arquivos 1156 testes (1 worker com timeout, refeito sozinho 10/10) |
| O que o humano roda | Ver `.scratch/PR-UNIFICADO-2026-10-09.md`: abrir o PR, CI verde, 6 migrations em ordem (`20261009010000`, `030000`, `040000`, `050000`, `060000`, `132551`), publicar `account-enrichment`, `reply-proposal-runner`, `agent-conversation`, `integration-connect`, `integration-tools`, `crm-handoff` e `integration-callback --no-verify-jwt`, reiniciar o worker do Hermes e publicar o frontend |

## 2026-10-09: fechamento de status

Fechados (ACs todos marcados): kanban 01, 02, 03; créditos 08; CRM-10 (migration `20261009050000` aplicada em prod); Hermes 01; autenticação 05 (verificado em produção pelo Renan).

## 2026-10-09: publicação canais 14, 15, 16

Migrations `20261009205538` e `20261009214037` aplicadas em prod (md5 conferido). Publicadas `sender-accounts`, `sequence-runner`, `sequence-step-sends`, `reply-proposal-send` e `unipile-account-status` (`--no-verify-jwt`).

Fechado (ACs todos marcados): canais-14.
Seguem abertos: canais-15 e canais-16, com AC desmarcado que depende de rodar `scripts/wizard-unipile.sh` (chave de API e segredo do webhook da Unipile, interativo) e do primeiro uso real.

## 2026-10-09: conexão Unipile v1 ativa

Conexão `trial-2026-10` (v1) ativa; chave testada pela VPS (200, 4 contas). Segredos de função `UNIPILE_API_KEY` e `UNIPILE_WEBHOOK_SECRET` iguais à conexão ativa. Sender accounts: 4 em `reconnect_required`.

Fechados: canais-15, canais-16. Segue aberto: canais-17 (falta o `Unipile-Auth` no webhook `AAA` e a mensagem de teste).

## 2026-10-10: evidência real da v1 (e-mail, WhatsApp, LinkedIn)

Produção, workspace `667e38aa`, Unipile v1, relatada pelo Auxiliar Renan. Só documentação: nenhum código, migration ou deploy neste registro.

| Canal | Envio | O que a produção mostrou |
|---|---|---|
| E-mail | `72f14695` | a resposta ligou ao envio (`provider_message_id` e conversa preenchidos), virou recebido e pausou a Sequência |
| WhatsApp | `1a1cfaed` | a resposta ligou ao envio, virou recebido e pausou a Sequência |
| LinkedIn | `b7cfb116` | a resposta ligou ao envio, virou `mensagem-recebida` e pausou a Sequência |
| Webhooks v1 | n/a | chegam autenticados pelo `Unipile-Auth`, sem 401 |

Só foram marcados os critérios que essa evidência cobre.

- **canais-17: fechado.** Os 9 critérios já estavam marcados pelo código; faltavam os Passos do Nan e o primeiro tráfego real. Sem tráfego real ainda (seguem como item do canais-12): `new_relation`, `AccountStatus`, o aviso do link de conexão com `?k=` de ponta a ponta, o remetente `@lid` do WhatsApp e os `headers` do `GET /api/v1/webhooks`.
- **canais-06: segue `ready-for-human`, 1 de 7.** Marcado: o envio real pela Conta remetente (1). Aberto: conversa reutilizada ou nova (2), distinção de eco próprio e da API (3), conversa pessoal ignorada (4), idempotência e restrição do conteúdo na pausa (5), timeout sem reenvio cego (6), reconexão com backlog (7).
- **canais-07: segue `ready-for-human`, 1 de 7.** Marcado: a identidade do Contato resolvida antes do envio real (1). Aberto: o convite, que não foi exercitado (2), impedimentos acionáveis (3), `new_relation` e aceite (4), conteúdo privado com evento público mínimo na pausa (5), evento atrasado ou repetido (6), testes (7, que é de código, não de produção). InMail segue fora (ticket 13).
- **canais-16** (já fechado): o texto velho "pendente apply" do critério 5 foi trocado pela nota de que as migrations `20261009205538` e `20261009214037` foram aplicadas em 2026-10-09.
- **canais-15** e **canais-16**: sem mudança de status.

## Auditoria de Sinais de 13/10/2026: proposta_recusada e tipos genéricos em cascatas

| Campo | Valor |
|---|---|
| Tickets | `.scratch/auditoria-de-sinais-2026-10-13/issues/01-sinal-interno-proposta-recusada.md` e `02-tipos-genericos-em-cascatas.md` (GATE conferido primeiro nos dois) |
| Status | ready-for-human (código fechado; faltam as 2 migrações e a publicação do `signal-runner`) |
| Branch | `claude/audit-signals-catalog-i2a697`, a partir da `main` d4fbf05; PR de rascunho contra `main`, sem merge |
| O que mudou | 01: Sinal interno `proposta_recusada` (resposta negativa registrada no desfecho de um Envio; dispara no registro mais o prazo; superado se a Conta voltou a conversar; sem dado pessoal, sem crédito). 02: seis tipos genéricos do catálogo ligados às cascatas de empresa, de qualquer ICP, por dado (`private.signal_type_cascades`); o Monitoramento roda as cascatas disponíveis e devidas (cadência) e grava o Sinal no tipo genérico. Regra do ICP registrada no `CONTEXT.md` e imposta no banco (só cascata de escopo Conta) |
| Fora do escopo (outro PR) | `src/**/sinais/**`, RPC de `market_signals`. A tela precisa de uma linha em `editor.tsx` (texto de `proposta-recusada`); ver o PR |
| Migrações a aplicar (em ordem, depois da `20261014170000`) | `20261015100000_sinal_proposta_recusada.sql`, `20261015110000_tipos_genericos_em_cascatas.sql`. Nenhuma tem `drop`; as duas usam `create or replace` em funções existentes (mesmo contrato) |
| O que o humano roda | Com o CI verde: aplicar as 2 migrações pelo `execute_sql` em bloco atômico; `npx supabase functions deploy signal-runner --project-ref ycbdilsmydvzezhlymty`; publicar o frontend. Os seis tipos ficam "Em teste" até uma cascata ligada ser validada e marcada disponível |
