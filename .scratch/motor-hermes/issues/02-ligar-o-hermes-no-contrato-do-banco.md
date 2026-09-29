# 02: Ligar o Hermes no contrato do banco do CRM-14

**What to build:** um worker na VPS reserva a Execução guardada (`claim_agent_run`), chama o perfil Hermes do Workspace,
grava os passos (`append_agent_run_event`) e fecha a Execução (`finish_agent_run`), no lugar da ponte
`agent-conversation`. A tela e as tabelas não mudam; o segredo de provedor escolhe entre a ponte e o Hermes.

**Blocked by:** None para o teste local; a VPS da Hostinger para produção.

**Status:** ready-for-human (worker local pronto; falta o Nan rodar o Hermes e conferir na tela)

- [ ] Um perfil Hermes por Workspace, criado quando o Workspace nasce; o app guarda qual perfil é de qual Workspace.
- [ ] O Hermes nunca é chamado pelo navegador; a chave de cada perfil fica só no worker.
- [ ] As ferramentas do Hermes são APIs do app que recebem o Workspace da Execução (começa pela consulta de Contas-alvo).
- [ ] O `run_id` do Hermes fica ligado à Execução do app; repetir o pedido não roda duas vezes.
- [ ] O Hermes não aparece com nome na tela (ADR-0004).
- [ ] Teste de vazamento: um perfil não lê memória, histórico nem ferramenta de outro.

## Comments

- 2026-09-29, primeiro corte local. Migration `20260929190000_fila_de_pedidos_para_motor_externo.sql` (`list_queued_agent_runs`, só service_role; pgTAP em `conversas_dos_agentes.sql`). `AGENT_PROVIDER=hermes` faz a `agent-conversation` só guardar o pedido. Worker em `supabase/functions/_hermes-worker/` (`worker.ts` testado sem rede, `main.ts` liga ao Supabase e ao Hermes, passo a passo no `README.md`). Endpoints conferidos na documentação oficial: `API_SERVER_ENABLED`, `API_SERVER_KEY`, porta 8642, `POST /v1/runs` com `Idempotency-Key`, `GET /v1/runs/{id}`, `POST /v1/runs/{id}/stop`, `agent.disabled_toolsets`. Um perfil só por enquanto (o do computador do Nan); o perfil por Workspace (`/p/<perfil>/`) entra na VPS. As Contas-alvo (até 10) vão nas instruções; ferramentas próprias por MCP ficam para o próximo corte.

