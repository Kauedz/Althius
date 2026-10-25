# 02: Adaptador do WhatsApp com simulador

**What to build:** Módulo `_shared/canal/` com a interface do WhatsApp (validar e normalizar o webhook, inclusive o bloco `pricing` dos status; enviar texto, botões e template; baixar mídia) e um simulador com modo de desenvolvimento. Veja a [spec](../spec.md) e o [ADR-0027](../../../docs/adr/0027-canal-whatsapp-com-controle-total.md).

**Blocked by:** None.

**Status:** ready-for-human

- [x] Simulador com assinatura HMAC em tempo constante, guardando os envios
- [x] Seleção simulado ou real num único ponto
- [x] Nenhum texto ao usuário cita o provedor
- [x] Deno

## Comments

### 2026-10-24

Implementado `supabase/functions/_shared/canal/` com validação de `X-Hub-Signature-256`, normalização de texto, áudio, botões, outros tipos e status com `pricing`; interface para texto, botões, template e download de mídia; simulador com histórico de envios e fixtures; adaptador direto Cloud selecionado centralmente e desligado por padrão. Erros apresentados pela interface são genéricos e não expõem o fornecedor.

Testes: `deno test supabase/functions/_shared/canal/adapter.test.ts` (5/5), `deno check supabase/functions/*/index.ts` e `deno test supabase/functions` (1789 aprovados, 0 falhas, 39 ignorados). A validação ampla usou `DENO_DIR=/tmp/deno-canais-02` porque o cache padrão do ambiente é somente leitura. Sem migration; nenhuma chamada externa foi feita.
