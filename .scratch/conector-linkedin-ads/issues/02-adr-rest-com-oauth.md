# 02: ADR da Integração por API REST com OAuth

**What to build:** um ADR para os apps sem MCP oficial cuja API exige OAuth (LinkedIn Ads e, talvez, o Kommo): a Althius usa o próprio app OAuth e expõe aos Agentes ferramentas REST definidas por ela (`rest.ts`), sob as mesmas regras da ADR-0022. Inclui como isso convive com as ADRs 0017 e 0021. **Não implementar** antes da aprovação.

**Blocked by:** nenhum.

**Status:** needs-info (ADR proposto; aguarda a aprovação do usuário)

## Comments

**20/10/2026 (agente).** Escrito como proposta em [`docs/adr/0029-integracao-por-api-rest-com-oauth-quando-nao-ha-mcp.md`](../../../docs/adr/0029-integracao-por-api-rest-com-oauth-quando-nao-ha-mcp.md). Nada foi implementado. O ADR diz que o Kommo só entra se tiver OAuth **por usuário**; com o OAuth só de administrador que a pesquisa encontrou, ele continua "Em breve".
