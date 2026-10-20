# 02: ADR do cliente OAuth por Workspace

**What to build:** um ADR em `docs/adr/` para o caso dos apps cuja política exige o projeto ou o app do próprio Cliente (Google Ads; talvez Salesforce e Teams): o Administrador cadastra no Workspace o client id e o secret do app do Cliente, que ficam no Vault e nunca voltam ao navegador. O Acesso de cada participante usa esse cliente. Inclui os riscos (segredo por Workspace, rotação, quem cadastra) e a comparação com as ADRs 0017 e 0021. **Não implementar** antes de o usuário aprovar o ADR.

**Blocked by:** nenhum.

**Status:** needs-info (ADR proposto; aguarda a aprovação do usuário)

## Comments

**20/10/2026 (agente).** Escrito como proposta (`status: proposed`) em [`docs/adr/0028-cliente-oauth-do-workspace-para-apps-que-exigem-o-app-do-cliente.md`](../../../docs/adr/0028-cliente-oauth-do-workspace-para-apps-que-exigem-o-app-do-cliente.md). Nada foi implementado. Ponto aberto que o ADR registra: se, no Google Ads, os Agentes chamando a API pelo cliente do Workspace contam como "proxy" pela política. Antes de construir, vale um parecer do Google ou o piloto (ticket 01).
