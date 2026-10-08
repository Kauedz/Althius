# 15: Aplicar Aprovações antes de ações externas

**What to build:** propostas de Agentes que exigem aprovação aparecem numa fila real; uma decisão autorizada controla se o backend executa exatamente a ação revisada.

**Blocked by:** 14: Executar Conversas e Coordenação com estado recuperável.

**Status:** ready-for-agent (autorizado trocar só a asserção de `raiz.test.tsx:110` para ligar a fila; depois, os Passos do Nan)

- [x] Proposta e Aprovação persistem com autor, Workspace, integração, ação, payload, estado e timestamp.
- [x] Ações com permissão Propor aguardam aprovação; Executar segue as permissões específicas definidas sem contornar controles.
- [x] Backend valida papel, Participação, permissão e estado da Aprovação imediatamente antes de executar.
- [x] Payload alterado materialmente invalida a decisão anterior e requer nova aprovação.
- [x] Aprovar, recusar, cancelar, expirar e falhar são estados visíveis e auditáveis.
- [ ] Fila e detalhe reaproveitam a experiência atual e não exibem roteiros de demonstração no Workspace real. (A Fonte está pronta e já pede a execução ao aprovar; a fila continua desligada, ver Etapa 5b.)
- [x] A Aprovação pedida por um Agente é decidida na própria Conversa, como passo, com Aprovar e Recusar só para o Administrador (2026-10-02, `conexoes-funcionais` 30).
- [x] Segundo executor: a chamada de ferramenta de um conector (`{tipo:'ferramenta', …}`), exatamente aquela, uma vez (ADR-0022).
- [x] Primeiro executor de ação externa: Enviar ao CRM proposto por um Agente (Etapa 5b), uma vez só e com o conteúdo revisado.
- [x] Com Executar, a Aprovação nasce liberada e o executor envia na hora; com Propor, fica pendente até o Administrador aprovar.
- [x] Aprovar na Fonte pede ao `crm-handoff` (`executar_aprovacao`) a execução; um envio que não sai não desfaz a decisão.

## Comments

- **Decisões do Nan (2026-10-01):** só o Administrador decide as Aprovações de ação; a pendente expira em 7 dias.
- Migration `20261001130000_aprovacoes_reais.sql`, aditiva. `private.approvals` guarda autor (quem pediu a Execução), Workspace, Agente, Integração, ação, impacto, justificativa, payload (e o hash dele), Conta-alvo, estado, quem decidiu, onde e quando, o prazo, a execução e a falha. `private.approval_events` guarda cada mudança de estado.
- `public.propose_agent_action` (só servidor): Permissão Ler ou Integração desligada recusam; Propor nasce pendente; Executar nasce liberada pela Permissão (auditada como as outras).
- `public.decide_approval` (só Administrador ativo; fila, Conversa ou Canal), `public.cancel_approval` (quem pediu ou Administrador), `public.list_approvals` e `public.list_approval_events` (Participantes). As pendentes vencidas expiram de hora em hora (pg_cron) e também a cada leitura da fila.
- `public.claim_approved_action` (só servidor, logo antes de executar) confere de novo o estado, o prazo, o payload exato (hash), a Permissão do Agente, a Integração ligada, a Participação de quem pediu e a de quem aprovou, e reserva (estado executando) só uma vez; `public.finish_approved_action` registra executada ou falhou.
- pgTAP `supabase/tests/aprovacoes_reais.sql` (30).
- Frontend: Fonte `supabase-aprovacoes.ts` (fila e decisão) e os estados novos na tela (Cancelada, Expirada, Aprovada · executada/falhou). A fila real fica atrás de `aprovacoesDisponiveis` em `composicao.ts`, desligada: hoje nenhum executor externo propõe ação, então ligar mostraria uma fila sempre vazia (e o teste de raiz espera a fila indisponível no Workspace operacional). Liga junto com o primeiro executor (Kanban 05, Enviar ao CRM).
- **Aberto:** o critério "Fila e detalhe reaproveitam a experiência atual" fica para quando a fila ligar; a revisão da Memória do Workspace (ADR-0010) ainda não tem backend.

- **Etapa 5b (2026-10-01).** Migration `20261001210000_ferramentas_dos_agentes.sql` (aditiva): `agent_propose_crm_handoff` guarda na Aprovação o conteúdo exato do envio (`private.crm_handoff_payload`), pela regra de sempre (`propose_agent_action`); `crm_handoff_approval` lê (com `p_admin_user_id`, só Administrador ativo), `begin_approved_crm_handoff` abre o envio ligado à Aprovação depois de `claim_approved_action` reservar, e `approval_in_execution` deixa `chamarFerramenta` escrever por um Agente com Propor só enquanto a Aprovação dele está em execução. pgTAP `ferramentas_dos_agentes.sql` (37).
- Executor `supabase/functions/_shared/executor-de-aprovacoes.ts` (testes `executor-de-aprovacoes.test.ts`, `integration-access-aprovacao.test.ts`), chamado de dois lugares: pelo motor dos Agentes logo depois de uma proposta que nasceu liberada (Executar), e pela Edge Function `crm-handoff` (`POST { action: 'executar_aprovacao', approvalId }`, com o JWT do Administrador; testes `crm-handoff/handler-aprovacao.test.ts`). A reserva única impede o envio duplo.
- Fonte `supabase-aprovacoes.ts`: depois de `decide_approval` aprovar, pede a execução ao `crm-handoff`; recusar não pede nada (teste `supabase-aprovacoes-executor.test.ts`).
- **A fila real continua desligada (`aprovacoesDisponiveis` em `composicao.ts`).** Ligar quebra um teste existente que não pode mudar: `raiz.test.tsx`, "/aprovacoes mostra que o módulo está indisponível, sem dados da Demonstração", espera "Aprovações ainda não estão disponíveis neste Workspace." no Workspace operacional (conferido: com o interruptor ligado, 1 falha em 120). Consequência honesta: com Propor, a Aprovação de envio fica pendente e o Administrador ainda não tem onde decidir no Workspace operacional (o link "Ver a Aprovação" do passo na Conversa leva à tela que diz indisponível). Com Executar, o envio sai normalmente. Para ligar: combinar com o Nan a troca daquele teste (ou um teste novo que o substitua) e passar `aprovacoesDisponiveis: true` em `auth/aplicativo.tsx`, de preferência atrás de uma checagem de que o `crm-handoff` está publicado.

- **2026-10-02 (conexoes-funcionais 30, ADR-0022).** A fila `/aprovacoes` continua desligada (o `raiz.test.tsx` não mudou), mas a decisão deixou de depender dela: o passo de ferramenta com Aprovação mostra o cartão da Aprovação na própria Conversa (`paginas/aprovacao-do-passo.tsx`), com Aprovar e Recusar só para o Administrador; `composicao.ts` liga a leitura e a decisão das Aprovações quando as Conversas estão disponíveis, sem tirar o módulo de `indisponiveis`. Depois de aprovar, a Fonte pede a execução ao `crm-handoff` (envio ao CRM) ou à `integration-tools` (`executar_aprovacao`, chamada de ferramenta). Migration `20261002110000_permissao_por_ferramenta.sql`: `propose_agent_action` e `claim_approved_action` redefinidas a partir de 20261001130000, mudando só a Aprovação de ferramenta (regra do Administrador conferida ao propor e ao reservar), e `tool_approval`. Executor `executarChamadaAprovada` em `_shared/executor-de-aprovacoes.ts`.

- 2026-10-07 (reconciliação contra a `main` 59e53a6). Não conferi o remoto (o conector do Supabase não estava ligado nesta sessão).
  - Dez critérios cumpridos, com evidência:
    - Persistência: `private.approvals` e `private.approval_events` em `20261001130000_aprovacoes_reais.sql:9,48`.
    - Propor espera e Executar nasce liberada: `propose_agent_action` (`:113`, redefinida em `20261002110000_permissao_por_ferramenta.sql:149`).
    - Revalidação antes de executar e payload alterado: `claim_approved_action` (`:260`, redefinida em `20261002110000:212`), hash em `:282`; pgTAP "um payload diferente do aprovado não sai"; Deno "um conteúdo diferente do aprovado não sai".
    - Estados visíveis: `src/fonte/supabase-aprovacoes.ts:19-37`; vitest "a fila vem de list_approvals, com os estados do banco na linguagem da tela".
    - Decisão no passo da Conversa, só Administrador: `src/paginas/aprovacao-do-passo.tsx:16`; vitest "o Administrador aprova no passo da Conversa, e a chamada aprovada é executada" e "na Coordenação, quem não é Administrador vê a Aprovação, mas não decide".
    - Os dois executores: `_shared/executor-de-aprovacoes.ts:101,329`; Deno "uma vez só: a segunda execução não é liberada e nada é chamado de novo".
    - Aprovar pede a execução: `supabase-aprovacoes.ts:92-105`, `crm-handoff/handler.ts:96-113`; vitest "aprovar pede ao crm-handoff a execução daquela Aprovação; recusar não pede".
  - Testes rodados: `npx vitest run src/fonte/supabase-aprovacoes.test.ts src/fonte/supabase-aprovacoes-executor.test.ts src/fonte/supabase-aprovacoes-ferramenta.test.ts src/paginas/aprovacao-do-passo.test.tsx src/paginas/aprovacao-simulada.test.tsx src/raiz.test.tsx …` (16 arquivos) → 230 passed, 0 failed; `deno test --allow-all supabase/functions/crm-handoff/ supabase/functions/_shared/executor-de-aprovacoes*.test.ts supabase/functions/_shared/integration-access-aprovacao.test.ts` → verdes; pgTAP `aprovacoes_reais.sql`, `ferramentas_dos_agentes.sql` e `permissao_por_ferramenta.sql` ok no CI 37707955273.
  - Não feito: a fila. `src/auth/aplicativo.tsx:359-370` não passa `aprovacoesDisponiveis` (padrão `false` em `src/fonte/composicao.ts:69`), e o teste antigo "/aprovacoes mostra que o módulo está indisponível, sem dados da Demonstração" (`src/raiz.test.tsx:110`) trava isso.
  - Achado novo que torna a fila necessária: as Conversas são privadas de quem pediu (`20260929180000_conversas_dos_agentes.sql:298,316`). Quando um Membro (o Vendedor responsável) pede um envio com Propor, só o Administrador decide (`decide_approval`), mas ele não vê a Conversa do Membro. A Aprovação fica pendente sem lugar para decidir e expira em 7 dias; o link "Ver a Aprovação" (`src/conversa/link-do-passo.tsx:10`) leva à tela indisponível.
  - Falta (agente, depois do sim do Nan para trocar o teste de `raiz.test.tsx:110`): passar `aprovacoesDisponiveis` em `aplicativo.tsx`, de preferência só com o `crm-handoff` publicado; trocar aquele teste por um da fila real (lê `list_approvals`, não mostra nada da Demonstração, o Administrador decide pela fila); emendar a ADR-0010 (ainda diz que qualquer participante decide, contra o `CONTEXT.md:329`). Depois, conferência visual da fila e do cartão no passo da Conversa.
  - Passos do Nan: conferir primeiro o que já está no remoto, no PowerShell, na raiz: `npx supabase link --project-ref ycbdilsmydvzezhlymty`, depois `npx supabase migration list --linked` e `npx supabase functions list --project-ref ycbdilsmydvzezhlymty`. O GO-LIVE diz que a `20261001210000` foi aplicada; a `20261002110000` é posterior. O que faltar segue os passos 1 a 5 acima.

- 2026-10-07, decisão do Renan: autorizado trocar só a asserção de `projeto-althius-frontend/src/raiz.test.tsx:110`, dentro deste ticket, para ligar a fila de Aprovações. É a linha `['/aprovacoes', 'Aprovações ainda não estão disponíveis neste Workspace.', 'Meta Ads']` do `it.each` "%s mostra que o módulo está indisponível, sem dados da Demonstração". As outras linhas desse `it.each` e os outros testes ficam como estão. Junto entra o teste novo da fila real: lê `list_approvals`, não mostra nada da Demonstração (nem "Meta Ads"), e o Administrador decide pela fila, inclusive a Aprovação pedida por um Membro. O resto da falta descrita acima continua: passar `aprovacoesDisponiveis` em `src/auth/aplicativo.tsx` e emendar a ADR-0010.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan.**

1. Aplicar a migration `supabase/migrations/20261001210000_ferramentas_dos_agentes.sql` no projeto `ycbdilsmydvzezhlymty` conforme `docs/agents/migrations.md` (validar com rollback, rodar `scripts/pgtap-no-remoto.sh supabase/tests/ferramentas_dos_agentes.sql`, aplicar e conferir o md5). Depende da `20261001200000_envio_ao_crm.sql` já aplicada.
2. Publicar as funções (PowerShell, na raiz do repositório):
   `npx supabase functions deploy agent-conversation crm-handoff --project-ref ycbdilsmydvzezhlymty`
   e, porque o código compartilhado do Acesso mudou (só acréscimo):
   `npx supabase functions deploy integration-tools integration-connect integration-callback --project-ref ycbdilsmydvzezhlymty`
   Nenhum segredo novo.
3. Se o motor for o Hermes (`AGENT_PROVIDER=hermes`): atualizar o código do worker (`supabase/functions/_hermes-worker`) na máquina dele e reiniciá-lo, como no README da pasta.
4. Conferência real: dar a um Agente a Permissão Executar no HubSpot, pedir na Conversa "Rhetor, leve a <Conta sob sua responsabilidade> ao HubSpot" e ver o envio no HubSpot e a Aprovação executada. Com Propor, a Aprovação fica pendente (a fila ainda está desligada, ver acima).

5. (2026-10-02) Aplicar `supabase/migrations/20261002110000_permissao_por_ferramenta.sql` conforme `docs/agents/migrations.md` (validar com rollback, rodar `scripts/pgtap-no-remoto.sh supabase/tests/permissao_por_ferramenta.sql`, aplicar e conferir o md5); depois `npx supabase functions deploy integration-tools agent-conversation crm-handoff integration-connect --project-ref ycbdilsmydvzezhlymty` e `npx supabase functions deploy integration-callback --no-verify-jwt --project-ref ycbdilsmydvzezhlymty`. Conferência: com o Rhetor em Propor no HubSpot, pedir na Conversa o envio de uma Conta sua; aprovar no próprio passo da Conversa, como Administrador, e ver o envio no HubSpot.

## Decisões a confirmar

- O ADR-0010 dizia que as Aprovações de ação podiam ser decididas por qualquer Participante ativo; com a decisão do Nan, no Workspace operacional só o Administrador decide. A Demonstração segue como estava.
- Excluir um Agente criado exclui as Aprovações dele, pendentes ou decididas, como o glossário (Aprovação) já dizia.
