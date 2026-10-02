# 20: Conectar o Acesso ao Google Calendar

**What to build:** o Google Calendar entra no catálogo real (categoria: Agenda (move o cartão para Reunião)) e cada participante conecta o próprio Acesso pelo servidor MCP oficial do app (ADR-0017), quando houver um confirmado; sem servidor oficial, fica "Em breve" com o motivo.

**Blocked by:** 03: Conectar e desconectar o próprio Acesso ao HubSpot (o mecanismo); 01: pesquisa dos servidores MCP, estendida para este app.

**Status:** needs-triage

## Pode mexer

- A entrada no catálogo (`private.integration_catalog`, migration aditiva) e o Acesso no mecanismo do ticket 03.

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Confirmar na documentação oficial se o app tem servidor MCP; registrar a fonte.
- [ ] Permissões Ler, Propor e Executar valem para o Agente; o que escreve ou gasta tem teto (`creditos-e-planos` 03).

## Comments

- **2026-10-02 (conectores genéricos, ticket 30).** Servidor MCP oficial confirmado: `https://calendarmcp.googleapis.com/mcp/v1`, cliente OAuth pré-registrado no Google Cloud. Perfil como dado em `_shared/integracoes/conectores.ts` (escopos da pesquisa); entra no catálogo do banco com o SQL do [ticket 30](./30-conectores-genericos-e-permissao-por-ferramenta.md), hoje bloqueado por testes antigos.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Criar a conta de teste no app e autorizar o Acesso no navegador.
2. Aplicar a migration e publicar (ticket 30): aplicar `supabase/migrations/20261002110000_permissao_por_ferramenta.sql` conforme `docs/agents/migrations.md` (validar com rollback, rodar `scripts/pgtap-no-remoto.sh supabase/tests/permissao_por_ferramenta.sql`, aplicar e conferir o md5); depois `npx supabase functions deploy integration-tools agent-conversation crm-handoff integration-connect integration-callback --project-ref ycbdilsmydvzezhlymty`.
3. No Google Cloud Console (APIs e serviços > Credenciais), criar um cliente OAuth "Aplicativo da Web" com a URL de retorno `https://ycbdilsmydvzezhlymty.supabase.co/functions/v1/integration-callback`, a tela de consentimento com `calendar.calendarlist.readonly`, `calendar.events.freebusy`, `calendar.events.readonly` e `calendar.events`; gravar `npx supabase secrets set GOOGLE_CALENDAR_MCP_CLIENT_ID=... GOOGLE_CALENDAR_MCP_CLIENT_SECRET=... --project-ref ycbdilsmydvzezhlymty`.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
