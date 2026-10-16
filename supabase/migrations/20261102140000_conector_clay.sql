-- O Clay conecta pelo servidor MCP oficial (conexoes-funcionais 11; https://university.clay.com/docs/connect-to-clay-mcp):
-- https://api.clay.com/v3/mcp, OAuth com registro dinâmico de cliente (api.clay.com/oauth/register), escopo `mcp` e PKCE.
-- Só OAuth (sem chave de API na v1). O token é por usuário e por workspace do Clay, sem um portal único a fixar no
-- Workspace: `pins_portal` falso, como Notion e Apollo. Aditiva: a linha do catálogo já existe; só entra o perfil.
-- O catálogo continua `available = false` até o deploy das funções e o teste com conta real (passo humano).
insert into private.integration_connection_profiles (integration_id, kinds, pins_portal) values
  ('clay', array['oauth_mcp'], false)
on conflict (integration_id) do nothing;
