# 03: Motivo do "Em breve" no cartão

**What to build:** conferir se o catálogo e a tela mostram o motivo de uma Integração estar "Em breve" (ex.: "aguardando o servidor oficial do Google"). Se não mostrarem, entra o motivo como dado do catálogo (migration aditiva) e no cartão, com teste do app. Serve ao Google Ads, ao LinkedIn Ads e ao Kommo.

**Blocked by:** nenhum.

**Status:** wontfix (não se aplica: o Workspace operacional oculta as Integrações indisponíveis desde o ticket 31)

## Comments

**20/10/2026 (agente, conferência com o código).** Não há "Em breve" no Workspace operacional para receber um motivo:
- a migration `20261009132551_conexoes_catalogo_disponivel.sql` (ticket 31) criou `available` e fez `list_workspace_integrations` devolver só as disponíveis;
- a Fonte real devolve `integracoesFuturas() = []` (`supabase-conexoes.ts`);
- o Google Ads, o LinkedIn Ads, o Kommo e o Zoho CRM simplesmente não aparecem lá. Só a Demonstração mostra "Em breve", com dados simulados.

Mostrar esses apps com um motivo seria desfazer a decisão do ticket 31, uma decisão de produto que não está pedida. Nada foi mudado.
