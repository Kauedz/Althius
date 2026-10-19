# 04: Publicar e validar o Lusha com conta real

**What to build:** aplicar as migrations de 01 e 02, publicar `integration-connect`, `integration-callback` e `integration-tools`, e testar com uma conta Lusha os dois caminhos. Só então ligar `available = true`. Se o OAuth for recusado (Lusha só para os clientes do diretório), uma migration tira `oauth_mcp` de `kinds` antes de ligar.

**Blocked by:** 01, 02, 03.

**Status:** ready-for-human

## Passos do Nan
1. Conferir (SQL Editor): `select id, available, writes from private.integration_catalog where id = 'lusha'; select kinds from private.integration_connection_profiles where integration_id = 'lusha';`
2. Aplicar as migrations pelo bloco atômico de `docs/agents/migrations.md`. Depois, no PowerShell:
   ```powershell
   npx supabase functions deploy integration-connect integration-callback integration-tools --project-ref ycbdilsmydvzezhlymty
   ```
3. Chave: no Lusha, gere uma chave de API da **sua** conta. Na Althius, use "Usar chave de API", veja as ferramentas e desconecte. Nunca cole a chave no chat.
4. OAuth: use "Conectar no Lusha" e anote se o Lusha aceitou ou recusou o cliente. Depois desconecte e confira se o token foi revogado.
5. Com Propor no Scopus, peça um enriquecimento: deve nascer uma Aprovação. Aprove uma e confira os créditos gastos no Lusha.

## Comments
