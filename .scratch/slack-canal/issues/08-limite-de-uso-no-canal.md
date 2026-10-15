# 08: Limite de uso por pessoa e por Workspace no Canal

Spec: [../spec.md](../spec.md) (seção "Limites e falhas de postagem").

**What to build:** um limite de pedidos pelo Canal Slack por pessoa e por Workspace numa janela de tempo (por exemplo, por minuto e por hora). Quem passa do limite recebe no thread "muitos pedidos seguidos, tente em instantes", sem Execução e sem Crédito. Hoje só existem o "ainda respondendo" (uma Execução aberta por fio) e o limite de Créditos.

**GATE:** migration aditiva com pgTAP (contagem por janela dentro de `start_slack_channel_run` ou RPC própria); sem deploy e sem aplicar no remoto. Os números do limite são decisão do Renan antes de começar.

**Blocked by:** 03.

**Status:** needs-triage (não implementado: precisa de migration e de números de limite; não é trivial)

## Critérios

- [ ] Limite por pessoa e por Workspace, com números decididos e escritos aqui
- [ ] Passou do limite: recusa curta no thread, sem Execução nem Crédito, e log sem texto
- [ ] Workspaces isolados: o limite de um não afeta outro (pgTAP)
- [ ] lint, `deno test`, `deno check` e pgTAP do zero verdes
