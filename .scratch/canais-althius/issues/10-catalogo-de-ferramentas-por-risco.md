# 10: Catálogo de ferramentas de plataforma por risco

**What to build:** Descritor por ferramenta (nome, RPC real, papéis, risco), lido pelo motor; começa com as de leitura do mapa. O risco é do código. Veja a [spec](../spec.md) e o [ADR-0027](../../../docs/adr/0027-canal-whatsapp-com-controle-total.md).

**Blocked by:** 05, 07.

**Status:** ready-for-human

- [x] Relatórios só em Créditos
- [x] O modelo não rebaixa o risco
- [x] Deno

## Comentário (2026-10-24)

Criado o catálogo inicial de leituras de plataforma com nome, RPC, papéis e risco fixo em código. Os relatórios de custo e resultado foram classificados na área Créditos. A classificação ignora qualquer risco recebido do modelo e não reconhece ferramenta que não esteja no catálogo. Conferi que todos os RPCs descritos existem nas migrations; nenhum SQL novo foi necessário.

Testes: `deno test supabase/functions/_shared/canal/ferramentas-plataforma.test.ts` (3/3); `deno check supabase/functions/*/index.ts`; `deno test supabase/functions` (1816 passaram, 0 falhas, 39 ignorados). Nenhuma migration aplicada remotamente, deploy ou chamada externa.
