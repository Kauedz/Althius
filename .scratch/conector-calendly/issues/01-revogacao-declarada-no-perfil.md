# 01: revogacao declarada no perfil

**What to build:** `PerfilOAuth.revogacao`: o endereço usado quando a descoberta não traz `revocation_endpoint`, sujeito à mesma origem do `token_endpoint` e ao mesmo emissor do token. Teste Deno no `integration-access-desconectar.test.ts` com o caso do Calendly (`calendly.com/oauth/revoke`).

**Blocked by:** nenhum

**Status:** ready-for-agent (feito na branch local `conectores-em-construcao`; vira closed no merge)

## Comments

**19/10/2026 (agente).** `PerfilOAuth.revogacao` (em `perfis.ts`): `desconectarAcesso` usa o endereço anunciado pelo servidor ou, sem ele, o declarado no perfil. As mesmas regras valem: https, mesma origem do `token_endpoint`, mesmo emissor e o cliente que recebeu o token. O Calendly declara `https://calendly.com/oauth/revoke`; o metadado lido ao vivo em 19/10 não o anuncia.

Teste `integration-access-desconectar-calendly.test.ts` (2 casos: revoga como cliente público; a recusa ainda desconecta, com aviso), vermelho antes e verde depois.
