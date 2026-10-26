# 11: Confirmação por botão ou SIM

**What to build:** Ações reversíveis mostram o resumo exato com os botões Aprovar/Recusar (ou "SIM"/"NAO"). Token de uso único ligado à Conta, ao Workspace, à ferramenta e ao hash; 10 min. Veja a [spec](../spec.md) e o [ADR-0027](../../../docs/adr/0027-canal-whatsapp-com-controle-total.md).

**Blocked by:** 10.

**Status:** ready-for-human

- [x] Clique ou SIM repetido, vencido ou alterado não faz nada
- [x] Cotação em Créditos antes de ações pagas
- [x] pgTAP e Deno

## Comentário (2026-10-24)

Implementada a infraestrutura de confirmação reversível do WhatsApp: token guardado somente como hash, associado à Conta, Workspace, ferramenta e hash do payload, com validade de 10 minutos e decisão atômica de uso único. O módulo de apresentação exibe o resumo e a cotação em Créditos antes do texto SIM/NAO. Nenhum dado sensível ou conteúdo da mensagem é armazenado. A integração ao executor fica para o ticket que cadastrar ferramentas reversíveis.

Testes: `deno test supabase/functions/_shared/canal/confirmacao.test.ts` (2/2); `deno check supabase/functions/*/index.ts`; `deno test supabase/functions` (1.818 passaram, 0 falhas, 39 ignorados); `PGPORT=55432 bash scripts/pgtap-local.sh pgtap_ca11` (suíte completa verde); pgTAP focal `PGPORT=55432 bash scripts/pgtap-local.sh pgtap_ca11 supabase/tests/whatsapp_confirmacao_reversivel.sql` (14/14). Nenhuma migration foi aplicada remotamente ou deploy feito.
