# 02: Ligar o Hermes no contrato do banco do CRM-14

**What to build:** um worker na VPS reserva a Execução guardada (`claim_agent_run`), chama o perfil Hermes do Workspace,
grava os passos (`append_agent_run_event`) e fecha a Execução (`finish_agent_run`), no lugar da ponte
`agent-conversation`. A tela e as tabelas não mudam; o segredo de provedor escolhe entre a ponte e o Hermes.

**Blocked by:** 01: Pesquisar a documentação oficial do Hermes Agent. Só roda com a VPS contratada (primeira venda).

**Status:** needs-info

- [ ] Um perfil Hermes por Workspace, criado quando o Workspace nasce; o app guarda qual perfil é de qual Workspace.
- [ ] O Hermes nunca é chamado pelo navegador; a chave de cada perfil fica só no worker.
- [ ] As ferramentas do Hermes são APIs do app que recebem o Workspace da Execução (começa pela consulta de Contas-alvo).
- [ ] O `run_id` do Hermes fica ligado à Execução do app; repetir o pedido não roda duas vezes.
- [ ] O Hermes não aparece com nome na tela (ADR-0004).
- [ ] Teste de vazamento: um perfil não lê memória, histórico nem ferramenta de outro.
