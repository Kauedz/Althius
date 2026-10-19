# 02: ADR do cliente OAuth por Workspace

**What to build:** um ADR em `docs/adr/` para o caso dos apps cuja política exige o projeto ou o app do próprio Cliente (Google Ads; talvez Salesforce e Teams): o Administrador cadastra no Workspace o client id e o secret do app do Cliente, que ficam no Vault e nunca voltam ao navegador. O Acesso de cada participante usa esse cliente. Inclui os riscos (segredo por Workspace, rotação, quem cadastra) e a comparação com as ADRs 0017 e 0021. **Não implementar** antes de o usuário aprovar o ADR.

**Blocked by:** nenhum.

**Status:** ready-for-agent

## Comments
