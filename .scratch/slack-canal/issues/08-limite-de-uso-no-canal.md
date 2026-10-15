# 08: Limite de uso por pessoa e por Workspace no Canal

Spec: [../spec.md](../spec.md) (seção "Limites e falhas de postagem").

**What to build:** um limite de pedidos pelo Canal Slack por pessoa e por Workspace numa janela de tempo. Quem passa do limite recebe no thread uma recusa curta, sem Execução e sem Crédito. O "ainda respondendo" (uma Execução aberta por fio) e o limite de Créditos continuam valendo.

**Padrões (ajustáveis por Workspace):** 20 pedidos por pessoa a cada 10 minutos e 200 pedidos por Workspace por hora. Ficam nas colunas `person_limit`, `person_window`, `workspace_limit` e `workspace_window` da instalação do Canal (`private.slack_channel_installations`); ajustar é um `update` nessa linha (ainda sem tela). Contam as Execuções com o gatilho Canal criadas na janela.

**GATE:** migration aditiva `20261102120000_limite_de_uso_do_canal_slack.sql` (colunas com padrão, índice `agent_runs_channel_usage_idx` e a RPC nova `slack_channel_usage_limit`, só do service role; sem `drop`), com pgTAP. Sem deploy e sem aplicar no remoto.

**Blocked by:** 03.

**Status:** ready-for-human (código no PR #224; falta o merge, o Nan aplicar a migration e republicar `slack-channel-events`)

## Critérios

- [x] Limite por pessoa e por Workspace, com os padrões acima escritos aqui e ajustáveis por Workspace (pgTAP: padrões na instalação)
- [x] Passou do limite: recusa curta no thread ("Você mandou muitos pedidos seguidos…" ou "Este Workspace chegou ao limite…"), sem Execução nem Crédito, e log sem texto (`slack-channel-events/handler-limite.test.ts`, 5 testes)
- [x] Vale para abrir e para continuar um fio
- [x] Se a leitura do limite falhar, o pedido segue e a falha fica no log (`falha_ao_ler_limite`): o limite não derruba o Canal
- [x] Workspaces isolados e janela respeitada: o limite de um não afeta outro, a pessoa não esgota o limite de outra, e os pedidos fora da janela não contam (pgTAP `limite_e_entrega_confirmada_do_canal_slack.sql`)
- [x] lint, `deno test`, `deno check` e pgTAP do zero verdes (ver Comments)

## Passos do Nan

- Aplicar a migration conforme `docs/agents/migrations.md` e republicar `slack-channel-events`
- Para testar no Slack: baixar o `person_limit` do Workspace de teste para 2, mandar 3 pedidos e conferir a recusa; voltar para 20

## Comments

**2026-10-15, agente:** implementado no PR #224. A contagem não é atômica com a abertura (dois pedidos no mesmo instante podem passar 1 acima do limite); para um limite de uso, aceitável.
