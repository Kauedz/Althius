begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(10);

-- O catálogo ampliado de conectores (migration 20261002111000, ticket 30): os apps novos listados, os que têm servidor
-- MCP com OAuth para terceiros habilitáveis, o Zoho CRM "Em breve" (o Salesforce ainda fora do catálogo, ver o ticket 30)
-- e o Pipedrive pelos dois caminhos.

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('5e000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5e000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5e000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('fe000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('fe000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('fe000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000001', 'admin', true),
  ('fe000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000002', 'member', true),
  ('fe000000-0000-0000-0000-000000000002', '5e000000-0000-0000-0000-000000000003', 'admin', true);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '5e000000-0000-0000-0000-000000000002', true);

-- 1. Bruno (Membro) vê os apps novos no catálogo, com nome e categoria.
select is(
  (select array_agg(id || ':' || name || ':' || category order by id)
     from public.list_workspace_integrations('fe000000-0000-0000-0000-000000000001')
    where id in ('slack', 'google-calendar', 'google-sheets', 'calendly', 'zoho-crm', 'bitrix24', 'tiktok-ads')),
  array[
    'bitrix24:Bitrix24:CRM',
    'calendly:Calendly:Agenda',
    'google-calendar:Google Calendar:Agenda',
    'google-sheets:Google Sheets:Conhecimento',
    'slack:Slack:Comunicação',
    'tiktok-ads:TikTok Ads:Mídia paga',
    'zoho-crm:Zoho CRM:CRM'
  ],
  'os sete apps novos aparecem no catálogo com nome e categoria'
);

-- 2. Os que têm servidor MCP com OAuth para terceiros nascem não habilitados (habilitáveis).
select is(
  (select array_agg(id order by id) from public.list_workspace_integrations('fe000000-0000-0000-0000-000000000001')
    where id in ('slack', 'google-calendar', 'google-sheets', 'calendly', 'bitrix24', 'tiktok-ads') and status = 'nao_habilitada'),
  array['bitrix24', 'calendly', 'google-calendar', 'google-sheets', 'slack', 'tiktok-ads'],
  'Slack, Google Calendar, Google Sheets, Calendly, Bitrix24 e TikTok Ads são habilitáveis'
);

-- 3-4. O Zoho CRM fica "Em breve", sem perfil de conexão; o Salesforce ainda não está no catálogo.
select is(
  (select array_agg(id || ':' || status order by id) from public.list_workspace_integrations('fe000000-0000-0000-0000-000000000001')
    where id in ('salesforce', 'zoho-crm')),
  array['zoho-crm:em_breve'],
  'o Zoho CRM aparece em breve e o Salesforce ainda não aparece'
);
reset role;
select is(
  (select count(*)::integer from private.integration_connection_profiles where integration_id = 'zoho-crm'),
  0,
  'o Zoho CRM não tem perfil de conexão'
);

-- 5. Os perfis novos conectam só pela autorização no app e não fixam portal.
select is(
  (select array_agg(integration_id || ':' || array_to_string(kinds, ',') || ':' || pins_portal::text order by integration_id)
     from private.integration_connection_profiles
    where integration_id in ('slack', 'google-calendar', 'google-sheets', 'calendly', 'bitrix24', 'tiktok-ads')),
  array[
    'bitrix24:oauth_mcp:false', 'calendly:oauth_mcp:false', 'google-calendar:oauth_mcp:false',
    'google-sheets:oauth_mcp:false', 'slack:oauth_mcp:false', 'tiktok-ads:oauth_mcp:false'
  ],
  'os conectores novos conectam por OAuth no servidor MCP, sem portal fixo'
);

-- 6. Não se habilita um app em breve.
set local role authenticated;
select set_config('request.jwt.claim.sub', '5e000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.enable_workspace_integration('fe000000-0000-0000-0000-000000000001', 'zoho-crm')$$,
  '22023', 'integration is not available for enablement',
  'o Zoho CRM não se habilita'
);

-- 7. Ana (Administradora) habilita o Slack e o Pipedrive; Bruno vê os caminhos de cada um.
select public.enable_workspace_integration('fe000000-0000-0000-0000-000000000001', 'slack');
select public.enable_workspace_integration('fe000000-0000-0000-0000-000000000001', 'pipedrive');
select set_config('request.jwt.claim.sub', '5e000000-0000-0000-0000-000000000002', true);
select is(
  (select kinds from public.integration_access_status('fe000000-0000-0000-0000-000000000001') where integration_id = 'slack'),
  array['oauth_mcp'],
  'o Slack habilitado conecta pela autorização no app'
);

-- 8. O Pipedrive conecta pela autorização no app (MCP) e pela chave de API, e continua fixando o portal.
select is(
  (select kinds from public.integration_access_status('fe000000-0000-0000-0000-000000000001') where integration_id = 'pipedrive'),
  array['oauth_mcp', 'api_key'],
  'o Pipedrive conecta pelo MCP e pela chave de API'
);
reset role;
select is(
  (select pins_portal from private.integration_connection_profiles where integration_id = 'pipedrive'),
  true,
  'o Pipedrive continua fixando o portal'
);

-- 9. A tentativa de OAuth do Pipedrive passa a ser aceita pelo servidor.
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$select public.start_integration_connect('fe000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000002', 'pipedrive',
      'https://oauth.pipedrive.com', 'https://ycbdilsmydvzezhlymty.supabase.co/functions/v1/integration-callback',
      'https://oauth.pipedrive.com/oauth/token', 'cliente-pd', null, null)$$,
  'a tentativa de OAuth do Pipedrive é aberta'
);

select * from finish();
rollback;
