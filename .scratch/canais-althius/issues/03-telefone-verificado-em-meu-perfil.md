# 03: Telefone verificado em Meu perfil

**What to build:** Código de 6 dígitos pelo template de autenticação (R$ 0,035 por entrega), guardado como hash, com validade e limites de tentativas e de reenvios (para conter o custo). Sem reserva por SMS. Único entre Contas. Suspenso sem login na Althius por 30 dias, sem novo código. E-mail ao verificar. Último Workspace e opt-in de avisos por tipo. Veja a [spec](../spec.md) e o [ADR-0027](../../../docs/adr/0027-canal-whatsapp-com-controle-total.md).

**Blocked by:** 02.

**Status:** ready-for-human

- [x] RLS e RPCs para iniciar, confirmar, reenviar, trocar e remover
- [ ] Bloco em Meu perfil com o número da Althius e atalho `wa.me` — pendente verificação humana: o número oficial ainda depende da configuração externa da Meta.
- [x] pgTAP, Deno e Vitest

## Comments

### 2026-10-24

Implementado o telefone verificado da Conta com hash e salt do código, validade de 10 minutos, até cinco tentativas, três reenvios por hora, unicidade entre Contas e suspensão depois de 30 dias sem login. O código sai pelo template de autenticação através do simulador/Cloud selecionado no adaptador do ticket 02; o código nunca volta ao navegador. A confirmação envia aviso ao e-mail da Conta. Meu perfil operacional permite iniciar, confirmar, reenviar, trocar e remover o telefone e informa quando está suspenso.

Meu perfil também permite ligar ou desligar os seis tipos de aviso proativo definidos na spec, por preferência da Conta; o último Workspace já é lembrado pela aplicação no navegador.

Se a entrega do e-mail falhar após confirmar o código, o telefone fica verificado e o envio aparece pendente para reenvio, sem perder a confirmação.

Testes: `PGPORT=55432 bash scripts/pgtap-local.sh pgtap_ca03` (154 arquivos, todos verdes; novo teste 26/26); `deno test supabase/functions` (1793 passaram, 0 falhas, 39 ignorados) e `deno check supabase/functions/*/index.ts` (verdes); `npx vitest run --maxWorkers=2 src/paginas/configuracoes/perfil-e-preferencias-reais.test.tsx` (39/39); `npx vitest run --maxWorkers=2` (218 arquivos passaram, 1 falhou em `contas-remetentes.test.tsx`, 1942 testes passaram, 4 ignorados; a falha se repete isoladamente e está fora deste ticket); `npm run lint` (exit 0, avisos existentes); `npx tsc -b` (exit 0).

Migration nova `20261122130300_telefone_verificado_whatsapp.sql`; não aplicada remotamente. A interface depende do template configurado em `WHATSAPP_AUTH_TEMPLATE` e do `RESEND_API_KEY` já usado pelo projeto. O número oficial e o atalho `wa.me` aguardam configuração externa da Meta e conferência humana em produção.
