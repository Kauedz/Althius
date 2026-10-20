-- O Lusha também conecta pela autorização no próprio Lusha (conector-lusha 02): o servidor MCP oficial publica OAuth em
-- auth.lusha.com, com registro dinâmico de cliente confidencial, escopo `mcp`, PKCE S256 e revogação (lido em 19/10/2026).
-- A chave de API continua como alternativa (ADR-0021). Se o teste com conta real mostrar que o Lusha recusa um cliente
-- fora do diretório dele, uma migration nova tira `oauth_mcp` antes de o Lusha ficar disponível (conector-lusha 04).
-- Aditiva: só dados.
update private.integration_connection_profiles
set kinds = array['oauth_mcp', 'api_key']
where integration_id = 'lusha';
