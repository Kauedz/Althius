# 05: Identidade do usuário nas ferramentas (JWT curto)

**What to build:** O executor chama as RPCs da tela com um JWT do usuário (`sub` = Conta, `role=authenticated`, `canal=whatsapp`, 60 s). O segredo não sai do servidor; o JWT nunca vai ao modelo nem ao log. A Atividade registra Conta, canal, ferramenta, hash e resultado. Veja a [spec](../spec.md) e o [ADR-0027](../../../docs/adr/0027-canal-whatsapp-com-controle-total.md).

**Blocked by:** 02, 03.

**Status:** ready-for-agent

- [ ] Mesma recusa da tela — pendente integrar o emissor ao executor de ferramentas e verificar uma RPC real de tela
- [ ] JWT expirado recusado — pendente verificar chamada de RPC com token expirado
- [x] Deno e pgTAP

## Comments

### 2026-10-24 — Codex

- Criado signer HS256 no servidor para JWT de ferramenta com `sub` da Conta, `role=authenticated`, `canal=whatsapp` e validade fixa de 60 segundos. A assinatura não é exposta ao modelo nem aos logs.
- Criada auditoria privada de ferramentas para Conta, Workspace, canal, ferramenta, hash do payload e resultado. A tabela não guarda texto da mensagem e a RPC fica acessível somente ao service role.
- A recusa idêntica à tela e a rejeição de token expirado continuam pendentes: este ticket não tem executor de ferramentas de plataforma conectado para exercitar as RPCs. Não marquei esses critérios sem essa verificação comportamental.
- Testes: `deno test supabase/functions/_shared/canal/jwt-usuario.test.ts` (2/2); `PGPORT=55432 bash scripts/pgtap-local.sh pgtap_ca05 supabase/tests/canal_whatsapp_identidade.sql` (4/4); `deno check supabase/functions/*/index.ts`; `deno test supabase/functions` (1800 passaram, 0 falhas, 39 ignorados); `PGPORT=55432 bash scripts/pgtap-local.sh pgtap_ca05` (suíte completa verde); frontend `npm run lint` e `npx tsc -b`.
- Migration `20261206120000_identidade_whatsapp_nas_ferramentas.sql` não aplicada remotamente.
