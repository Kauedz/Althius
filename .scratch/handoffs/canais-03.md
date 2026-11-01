# Handoff: canais-althius 03 — Telefone verificado em Meu perfil

Branch `ralph/canais-03-telefone-verificado-em-meu-perfil`, baseada em `ralph/canais-02-adaptador-do-whatsapp-com-simulador`. O ticket e o contexto do produto ficam em `.scratch/canais-althius/issues/03-telefone-verificado-em-meu-perfil.md`, `.scratch/canais-althius/spec.md`, `.scratch/canais-althius/decisoes.md` e `docs/adr/0027-canal-whatsapp-com-controle-total.md`.

Implementação: telefone verificado por template de autenticação, código com hash e salt, validade e limites, unicidade, suspensão após 30 dias sem login, aviso por e-mail com estado pendente e opção de reenvio, UI em Meu perfil e Edge Function usando o adaptador do ticket 02. Preferências dos seis tipos de aviso ficam por Conta e atualizações parciais não sobrescrevem outras opções. A aplicação já lembra o último Workspace no navegador. A migration `supabase/migrations/20261122130300_telefone_verificado_whatsapp.sql` não foi aplicada remotamente. O ticket permanece `ready-for-human` porque o número oficial e o atalho `wa.me` dependem da configuração externa da Meta e da conferência humana.

Não houve chamada externa real, aplicação remota de migration, deploy ou alteração de segredo. Não houve `git add` nem commit: a regra de sandbox fornecida pelo usuário proíbe essas operações e a matriz commita depois. O corpo do PR está em `/workspace/ralph-wt/_pr/canais-03.md`.

Validação: pgTAP completo (154 arquivos verdes; novo arquivo 26/26); `deno test supabase/functions` (1793 passaram, 0 falhas, 39 ignorados); `deno check supabase/functions/*/index.ts` verde; Vitest focal do perfil 39/39. `npm run lint` e `npx tsc -b` verdes, lint com avisos já existentes. A suíte completa Vitest teve 218 arquivos verdes e 1 falha não relacionada em `contas-remetentes.test.tsx` (assertiva ambígua por múltiplos alerts), 1942 testes passaram e 4 foram ignorados. Reexecução isolada confirmou a mesma falha, fora dos arquivos deste ticket.

## Suggested skills

- `code-review` — revisão dos commits desta branch contra o ticket e os padrões do repo.
- `supabase` — se a sessão seguinte precisar tratar da publicação ou da migration Supabase.
- `tdd` — se a sessão seguinte corrigir a falha preexistente do Vitest.
