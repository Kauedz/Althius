# 04: Habilitar o Canal WhatsApp em Conexões

**What to build:** O Administrador habilita e retira o Canal; o Membro só vê. O cartão só oferece Habilitar com o adaptador configurado. Os Agentes padrão ganham `whatsapp` na lista de canais. Veja a [spec](../spec.md) e o [ADR-0027](../../../docs/adr/0027-canal-whatsapp-com-controle-total.md).

**Blocked by:** None.

**Status:** ready-for-human

- [x] Retirar não apaga nada
- [x] Demonstração intocada
- [x] pgTAP e Vitest

## Comments

### 2026-10-24

Conexões agora permite que Administradores habilitem e retirem o WhatsApp por Workspace; Membros só veem o estado. O cartão só libera a habilitação quando o endpoint confirma que o simulador está disponível ou que o runtime Cloud tem todas as configurações necessárias. A retirada altera apenas o estado e preserva Conversas, Atividade e personalização dos Agentes.

A migration `20261122130400_habilitar_whatsapp_em_conexoes.sql` cria o estado por Workspace e inclui `whatsapp` nos canais dos Agentes padrão existentes e futuros. A Demonstração continua usando a fonte simulada existente.

Testes: `PGPORT=55432 bash scripts/pgtap-local.sh pgtap_ca04` (155 arquivos verdes; teste novo 8/8); Vitest focal de Conexões/Agentes/Demonstração (45/45); `npm run lint` (exit 0, avisos existentes); `npx tsc -b` (exit 0); `deno check supabase/functions/*/index.ts` (verde); `deno test supabase/functions` (1796 passaram, 0 falhas, 39 ignorados).

Migration não aplicada remotamente. Sem chamadas à Meta e sem deploy.
