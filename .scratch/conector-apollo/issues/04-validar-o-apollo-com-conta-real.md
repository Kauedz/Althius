# 04: Publicar e validar o Apollo com conta real

**What to build:** aplicar a migration de 01, publicar as funções e testar com uma conta Apollo de e-mail corporativo:
- OAuth: anotar as permissões que o consentimento mostrou;
- ver as ferramentas e anotar os nomes reais;
- uma busca e um enriquecimento sob Aprovação, com os créditos conferidos no Apollo;
- desconectar, com a revogação conferida;
- a chave mestra pelo MCP.

Se o OAuth sem `scope` não conceder o necessário, abrir um ticket para pedir os escopos mínimos da spec. Só então `available = true`.

**Blocked by:** 01, 02, 03.

**Status:** ready-for-human

## Passos do Nan
1. Conferir: `select id, available, writes from private.integration_catalog where id = 'apollo'; select kinds from private.integration_connection_profiles where integration_id = 'apollo'; select issuer, registered_at from private.integration_oauth_clients where integration_id = 'apollo';`
2. Aplicar as migrations (`docs/agents/migrations.md`) e publicar:
   ```powershell
   npx supabase functions deploy integration-connect integration-callback integration-tools --project-ref ycbdilsmydvzezhlymty
   ```
3. Fazer o roteiro acima e anotar o resultado aqui, sem colar chave nem token.

## Comments
