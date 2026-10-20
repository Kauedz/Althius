# 01: perfil confirmado e testes

**What to build:** Atualizar o perfil do Slack com o que a pesquisa confirmou (tirar os "não confirmado" resolvidos), `writes = true` se não estiver, e testes Deno do consentimento com `client_secret_post`, PKCE e escopos de usuário.

**Blocked by:** nenhum

**Status:** ready-for-agent (feito na branch local `conectores-em-construcao`; vira closed no merge)

## Comments

**20/10/2026 (agente).**
- O metadado de `mcp.slack.com`, lido de novo ao vivo, confirma o perfil: o PRM fica na raiz, sem registro dinâmico, com `client_secret_post`, PKCE S256 e 30 escopos de usuário.
- Perfil: `autenticacaoDoToken: 'client_secret_post'`, os 30 escopos e a conta por `auth.test` (`user`). O comentário do perfil diz que é o mesmo app do Canal.
- Os dois "não confirmado" antigos foram resolvidos. Ficaram outros dois: os nomes das ferramentas, e se `auth.test` e `auth.revoke` aceitam o token do MCP.
- O catálogo já tinha `writes = true`, então não houve migration.
- Testes, vermelhos antes e verdes depois:
  - `integration-connect/handler-slack.test.ts`: o consentimento em `slack.com/oauth/v2_user/authorize` com PKCE e os 30 escopos, sem `resource`; sem o app, `nao_configurada`, sem registro;
  - `integration-callback/handler-slack.test.ts`: a troca com `client_secret_post` e a conta pelo `auth.test`.
- `deno test supabase/functions`: 1665 passaram.
- A revogação fica `nao_suportado`: o Slack não anuncia endpoint RFC 7009, e o `auth.revoke` dele é outra API.
