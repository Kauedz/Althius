# 22: Conectar o Acesso ao Slack

**What to build:** o Slack entra no catálogo real (categoria: Canal de conversa com os Agentes) e cada participante conecta o próprio Acesso pelo servidor MCP oficial do app (ADR-0017), quando houver um confirmado; sem servidor oficial, fica "Em breve" com o motivo.

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

- **2026-10-02 (conectores genéricos, ticket 30).** Servidor MCP oficial confirmado: `https://mcp.slack.com/mcp`, cliente pré-registrado (app Slack com ID fixo, sem registro dinâmico; [pesquisa](../pesquisa-conectores-mcp-todos.md)). O perfil já é dado em `_shared/integracoes/conectores.ts` e os Agentes usam as ferramentas dele pelo `usar_conector`, com a permissão por ferramenta (ADR-0022). Falta o Slack entrar no catálogo do banco: bloqueado por dois testes antigos, com o SQL pronto no [ticket 30](./30-conectores-genericos-e-permissao-por-ferramenta.md).

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Criar a conta de teste no app e autorizar o Acesso no navegador.
2. Aplicar a migration e publicar (ticket 30): aplicar `supabase/migrations/20261002110000_permissao_por_ferramenta.sql` conforme `docs/agents/migrations.md` (validar com rollback, rodar `scripts/pgtap-no-remoto.sh supabase/tests/permissao_por_ferramenta.sql`, aplicar e conferir o md5); depois `npx supabase functions deploy integration-tools agent-conversation crm-handoff integration-connect --project-ref ycbdilsmydvzezhlymty` e `npx supabase functions deploy integration-callback --no-verify-jwt --project-ref ycbdilsmydvzezhlymty`.
3. Criar o app em https://api.slack.com/apps com a URL de retorno `https://ycbdilsmydvzezhlymty.supabase.co/functions/v1/integration-callback` e os escopos de usuário das ferramentas MCP (lista na pesquisa); gravar `npx supabase secrets set SLACK_MCP_CLIENT_ID=... SLACK_MCP_CLIENT_SECRET=... --project-ref ycbdilsmydvzezhlymty` (o valor só no terminal).

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
