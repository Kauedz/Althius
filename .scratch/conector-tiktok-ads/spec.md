# Spec: Conector TikTok Ads funcional

**Status:** ready-for-agent

**Frente:** Conexões funcionais. Fonte: [pesquisa de 19/10](../conexoes-funcionais/pesquisa-2026-10-19-anuncios.md#tiktok-ads). Substitui o ticket `conexoes-funcionais/26`.

## Problem Statement

O perfil existe em `conectores.ts` (`tt-ads-mcp-layer`). Os metadados ao vivo confirmam:
- registro dinâmico em `.../tt-ads-mcp-layer/oauth/register`;
- cliente público e PKCE S256;
- revogação em `.../oauth/revoke`;
- um escopo único, `mcp:tt4b`;
- o metadado em `<issuer>/.well-known/oauth-authorization-server`, no formato com o caminho antes do `.well-known`.

Pontos que importam:

- **Gasto.** O escopo único dá tudo. São cerca de 400 ferramentas, incluindo criar campanha, pausar e ajustar orçamento e lance: gastam verba.
- **30 dias.** A autorização vale 30 dias e depois exige reautorizar, mesmo com refresh token.
- **Conta.** A identificação da conta não está confirmada (há `id_token` no metadado).

## Solution

1. Usar a variante **`-layer`** (cerca de 40 ferramentas no início, as outras sob demanda). A `-flat` sobrecarregaria a lista de ferramentas e as regras.
2. `writes = true` e `ferramentasGastam: true`: toda chamada pede Aprovação, porque o escopo não separa leitura de gasto.
3. Depois de 30 dias, o Acesso vai para "Precisa reconectar" sem tratar isso como falha: o texto do cartão explica que o TikTok pede uma nova autorização a cada 30 dias.
4. A descoberta precisa achar o metadado no formato `<issuer>/.well-known/...`. `candidatosDoMetadadoDoServidor` já tenta esse formato (terceiro candidato), mas falta teste que o trave.
5. Conta: ler o `id_token` da troca se vier; senão, mostrar só "Conectado".

## Decisões a confirmar

| Decisão | Escolha desta spec | Alternativa |
| --- | --- | --- |
| Variante | `-layer` | `-flat` |
| Gasto | Toda ferramenta pede Aprovação | Confiar no `readOnlyHint` |

## Tickets

- 01: `ferramentasGastam`, `writes` e a descoberta com o metadado em `<issuer>/.well-known/...` (testes Deno e pgTAP).
- 02: o texto dos 30 dias no "Precisa reconectar" do TikTok, e os testes do cartão com prints.
- 03 (humano): conectar uma conta do TikTok Ads Manager, ver as ferramentas, um relatório sob Aprovação, desconectar e conferir a revogação. Só então `available = true`.
