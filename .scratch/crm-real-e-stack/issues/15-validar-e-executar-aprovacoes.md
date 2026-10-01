# 15: Aplicar Aprovações antes de ações externas

**What to build:** propostas de Agentes que exigem aprovação aparecem numa fila real; uma decisão autorizada controla se o backend executa exatamente a ação revisada.

**Blocked by:** 14: Executar Conversas e Coordenação com estado recuperável.

**Status:** ready-for-agent (backend e Fonte prontos; a fila real liga com o primeiro executor de ação externa)

- [x] Proposta e Aprovação persistem com autor, Workspace, integração, ação, payload, estado e timestamp.
- [x] Ações com permissão Propor aguardam aprovação; Executar segue as permissões específicas definidas sem contornar controles.
- [x] Backend valida papel, Participação, permissão e estado da Aprovação imediatamente antes de executar.
- [x] Payload alterado materialmente invalida a decisão anterior e requer nova aprovação.
- [x] Aprovar, recusar, cancelar, expirar e falhar são estados visíveis e auditáveis.
- [ ] Fila e detalhe reaproveitam a experiência atual e não exibem roteiros de demonstração no Workspace real.

## Comments

- **Decisões do Nan (2026-10-01):** só o Administrador decide as Aprovações de ação; a pendente expira em 7 dias.
- Migration `20261001130000_aprovacoes_reais.sql`, aditiva. `private.approvals` guarda autor (quem pediu a Execução), Workspace, Agente, Integração, ação, impacto, justificativa, payload (e o hash dele), Conta-alvo, estado, quem decidiu, onde e quando, o prazo, a execução e a falha. `private.approval_events` guarda cada mudança de estado.
- `public.propose_agent_action` (só servidor): Permissão Ler ou Integração desligada recusam; Propor nasce pendente; Executar nasce liberada pela Permissão (auditada como as outras).
- `public.decide_approval` (só Administrador ativo; fila, Conversa ou Canal), `public.cancel_approval` (quem pediu ou Administrador), `public.list_approvals` e `public.list_approval_events` (Participantes). As pendentes vencidas expiram de hora em hora (pg_cron) e também a cada leitura da fila.
- `public.claim_approved_action` (só servidor, logo antes de executar) confere de novo o estado, o prazo, o payload exato (hash), a Permissão do Agente, a Integração ligada, a Participação de quem pediu e a de quem aprovou, e reserva (estado executando) só uma vez; `public.finish_approved_action` registra executada ou falhou.
- pgTAP `supabase/tests/aprovacoes_reais.sql` (30).
- Frontend: Fonte `supabase-aprovacoes.ts` (fila e decisão) e os estados novos na tela (Cancelada, Expirada, Aprovada · executada/falhou). A fila real fica atrás de `aprovacoesDisponiveis` em `composicao.ts`, desligada: hoje nenhum executor externo propõe ação, então ligar mostraria uma fila sempre vazia (e o teste de raiz espera a fila indisponível no Workspace operacional). Liga junto com o primeiro executor (Kanban 05, Enviar ao CRM).
- **Aberto:** o critério "Fila e detalhe reaproveitam a experiência atual" fica para quando a fila ligar; a revisão da Memória do Workspace (ADR-0010) ainda não tem backend.

## Decisões a confirmar

- O ADR-0010 dizia que as Aprovações de ação podiam ser decididas por qualquer Participante ativo; com a decisão do Nan, no Workspace operacional só o Administrador decide. A Demonstração segue como estava.
- Excluir um Agente criado exclui as Aprovações dele, pendentes ou decididas, como o glossário (Aprovação) já dizia.
