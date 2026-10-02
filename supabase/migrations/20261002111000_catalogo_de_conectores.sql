-- O catálogo ampliado de conectores (conexoes-funcionais 30; ADR-0017, ADR-0021 e ADR-0022). Os conectores funcionam como
-- os do Claude: o app é só DADO de perfil (o endereço do servidor MCP oficial e como o cliente OAuth se registra, em
-- supabase/functions/_shared/integracoes/conectores.ts e perfis.ts), e o que cada conector faz vem do `tools/list` do
-- próprio servidor. Aditiva: só acrescenta linhas ao catálogo e aos perfis e um caminho ao Pipedrive.

-- 1. Os apps novos no catálogo. O Salesforce fica de fora por ora: o pgTAP antigo agentes_e_permissoes.sql usa
-- 'salesforce' como exemplo de Integração fora do catálogo (ver o ticket 30). As categorias 'Agenda' e 'Comunicação' são
-- novas; `category` é texto livre (sem check) e `list_workspace_integrations` as ordena depois das quatro conhecidas.
insert into private.integration_catalog (id, name, writes, category, description) values
  ('slack', 'Slack', true, 'Comunicação', 'Canais, mensagens e canvases do Slack.'),
  ('google-calendar', 'Google Calendar', true, 'Agenda', 'Agenda e eventos do Google Calendar.'),
  ('google-sheets', 'Google Sheets', true, 'Conhecimento', 'Planilhas do Google Sheets.'),
  ('calendly', 'Calendly', true, 'Agenda', 'Tipos de evento e agendamentos do Calendly.'),
  ('zoho-crm', 'Zoho CRM', true, 'CRM', 'Contas, contatos e negócios do Zoho CRM.'),
  ('bitrix24', 'Bitrix24', true, 'CRM', 'CRM, tarefas e comunicação do Bitrix24.'),
  ('tiktok-ads', 'TikTok Ads', true, 'Mídia paga', 'Campanhas e públicos do TikTok Ads.')
on conflict (id) do nothing;

-- 2. Os perfis de conexão dos que já têm como conectar: servidor MCP remoto oficial com OAuth para terceiros. O Zoho CRM
-- fica sem perfil ("Em breve"): o servidor é criado na conta de cada cliente, e não há um app da Althius que sirva para
-- todos (pesquisa-conectores-mcp-todos.md).
insert into private.integration_connection_profiles (integration_id, kinds, pins_portal) values
  ('slack', array['oauth_mcp'], false),
  ('google-calendar', array['oauth_mcp'], false),
  ('google-sheets', array['oauth_mcp'], false),
  ('calendly', array['oauth_mcp'], false),
  ('bitrix24', array['oauth_mcp'], false),
  ('tiktok-ads', array['oauth_mcp'], false)
on conflict (integration_id) do nothing;

-- 3. O Pipedrive conecta também pelo servidor MCP oficial (https://mcp.pipedrive.ai/mcp), com OAuth no próprio Pipedrive;
-- a chave de API continua como alternativa. O `pins_portal` não muda: o primeiro Acesso fixa o portal pelos dois caminhos.
update private.integration_connection_profiles
set kinds = array['oauth_mcp', 'api_key']
where integration_id = 'pipedrive'
  and not ('oauth_mcp' = any (kinds));
