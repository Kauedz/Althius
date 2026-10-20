-- Make e Zapier no catálogo (conector-make 01, conector-zapier 01), na categoria nova 'Automação' (`category` é texto
-- livre). Os dois têm servidor MCP hospedado com OAuth e registro dinâmico (metadados lidos em 19/10/2026); o Zapier aceita
-- também o token de conexão como chave (ADR-0021). As ferramentas gastam do plano do Cliente (operações do Make, 2 tasks
-- por chamada do Zapier): `writes`. Ficam `available = false` até o teste com conta real. Aditiva: só dados.
insert into private.integration_catalog (id, name, writes, category, description, available) values
  ('make', 'Make', true, 'Automação', 'Cenários do Make rodados pelos Agentes.', false),
  ('zapier', 'Zapier', true, 'Automação', 'Ações dos apps ligados ao Zapier.', false)
on conflict (id) do nothing;

insert into private.integration_connection_profiles (integration_id, kinds, pins_portal) values
  ('make', array['oauth_mcp'], false),
  ('zapier', array['oauth_mcp', 'api_key'], false)
on conflict (integration_id) do nothing;
