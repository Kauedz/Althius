# 12: Link de ação de uso único com login e OAuth

**What to build:** Ações irreversíveis aceitam botão ou SIM só com login nas últimas 12 h; senão, link `/a/<token>` com login, 15 min. Integração sempre por link OAuth; chave de API nunca pelo chat. Veja a [spec](../spec.md) e o [ADR-0027](../../../docs/adr/0027-canal-whatsapp-com-controle-total.md).

**Blocked by:** 11.

**Status:** done

- [x] Step-up testado nos dois lados
- [x] Página nova no front
- [x] pgTAP, Deno e Vitest

## Comentário (2026-10-24)

Criada a infraestrutura de links de ação de uso único, vinculados à Conta, Workspace, ferramenta e hash do payload, com expiração de 15 minutos e decisão autenticada. O servidor exige login nas últimas 12 horas; a página `/a/<token>` mostra a ação e permite aprovar ou recusar, encaminhando a Integração pelo OAuth oficial. O caminho é preservado durante o login e a página nunca pede chave de API. Migration aditiva `20261122131200_link_de_acao_whatsapp.sql`; não aplicada remotamente.

Testes: pgTAP focal `PGPORT=55432 bash scripts/pgtap-local.sh pgtap_ca12 supabase/tests/whatsapp_link_de_acao.sql` (8/8); pgTAP completo `PGPORT=55432 bash scripts/pgtap-local.sh pgtap_ca12` (suíte verde); Vitest `npx vitest run --maxWorkers=2 src/auth/pagina-link-acao.test.tsx` (3/3); `npm run lint`; `npx tsc -b`; `deno check supabase/functions/*/index.ts`; `deno test supabase/functions` (verde). Nenhuma migration foi aplicada remotamente nem houve chamada real à Meta. As ferramentas irreversíveis ainda não estão cadastradas no catálogo do Canal; os próximos tickets que as adicionarem devem criar os links por esta RPC e encaminhar a aprovação ao executor de negócio.
