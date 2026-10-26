# Handoff: canais-althius 04 — habilitar WhatsApp em Conexões

Branch atual: `ralph/canais-04-habilitar-o-canal-whatsapp-em-conexoe`, baseada em `ralph/canais-03-telefone-verificado-em-meu-perfil`. Ticket: `.scratch/canais-althius/issues/04-habilitar-o-canal-whatsapp-em-conexoes.md`.

## Implementação

- Migration `supabase/migrations/20261122130400_habilitar_whatsapp_em_conexoes.sql`: estado do WhatsApp por Workspace; RPC de leitura disponível para Membros e RPC de alteração apenas para Administradores ativos; retirada preserva o registro. Os Agentes padrão existentes e futuros incluem `whatsapp` em `agent_settings.channels`.
- `projeto-althius-frontend/src/fonte/supabase-conexoes.ts` lê o estado e a prontidão do runtime; o cartão só habilita quando `canal-whatsapp-status` confirma simulador ou configuração Cloud completa. A retirada não exige que o adaptador ainda esteja configurado.
- `projeto-althius-frontend/src/paginas/conexoes.tsx` fornece os fluxos Habilitar/Retirar. A Demonstração continua usando a fonte simulada anterior.
- Nova Edge `supabase/functions/canal-whatsapp-status/` reporta somente booleano de disponibilidade: modo de desenvolvimento/simulador disponível por padrão; Cloud só quando token, phone number id, API version e app secret estão presentes.
- Testes novos: `supabase/tests/canal_whatsapp_em_conexoes.sql`, Vitest da fonte e do cartão, testes Deno do status.

## Decisões e revisão

- Seam pré-confirmado pelo Renan: fonte RPC, cartão real em Conexões e comportamento de estado no banco.
- A revisão Spec detectou que a primeira versão não conferia se o adaptador estava configurado; foi acrescentado o endpoint autenticado e a proteção no caminho de habilitação.
- A revisão Standards não encontrou violação documentada. A sugestão de mapear os estados foi incorporada. Comentários que diziam que somente Slack era real foram atualizados.
- O usuário proibiu `git add` e `git commit`; as mudanças ficam no worktree e a matriz fará o commit depois. `git diff base...HEAD` está vazio enquanto isso; a revisão considerou também o diff não commitado.

## Validação

- Red Vitest: o estado `ativo` aparecia como `Em breve`; depois, fonte/cartão passaram.
- Red pgTAP: a RPC `whatsapp_channel_status` não existia; depois, teste focal 8/8.
- pgTAP completo: 155 arquivos verdes, incluindo 8/8 do novo teste.
- Vitest focal ampliado: 6 arquivos, 45 testes passaram (Conexões WhatsApp, estado da fonte, Conexões reais, Slack, Agentes reais e catálogo/Demonstração).
- `npm run lint`: exit 0, com avisos preexistentes. `npx tsc -b`: exit 0.
- `deno check supabase/functions/*/index.ts`: passou.
- `deno test supabase/functions`: 1796 passaram, 0 falhas, 39 ignorados.
- Migration não aplicada remotamente; nenhuma Edge Function deployada; nenhum segredo ou arquivo `.env` tocado; nenhuma chamada real à Meta.

## Correção da revisão (2026-10-26)

- `supabase-conexoes.ts` agora preserva o estado persistido (`ativo` ou `retirado`) mesmo se o adaptador estiver indisponível. O adaptador continua bloqueando a habilitação inicial e a reabilitação; `nao_habilitado` sem adaptador permanece “Em breve”. O Administrador ainda pode retirar um Canal ativo sem adaptador.
- Decisão conservadora: a Conexão mostra o estado real `Ativo`, mas o WhatsApp não aparece conectado na aba Canais do Agente enquanto não houver adaptador configurado. Assim a interface não sugere que o Agente possa atender nesse Canal quando o runtime não está pronto.
- `ever_enabled` agora tem default `false`; pgTAP verifica esse default.
- TDD: Vitest novo primeiro falhou em estado, conexão do Agente e botão Retirar (3 falhas); após a correção, focal passou 14/14. pgTAP novo falhou primeiro porque o default era `true`; após corrigir a migration, focal passou 9/9.
- Suítes: pgTAP completo em `pgtap_rvfix_277` passou; `deno check supabase/functions/*/index.ts` e `deno test supabase/functions` passaram (1796, 0 falhas, 39 ignorados); frontend `npm run lint` passou com avisos existentes, `npx tsc -b` passou e `npm run build` passou. Vitest completo com Node 22: 221 arquivos, 1954 passaram, 4 ignorados. Uma primeira execução teve timeout isolado ao iniciar worker após 1948 testes sem falha de asserção; a repetição completa terminou verde.
- Suposição registrada: estado do Workspace e disponibilidade operacional do runtime são informações distintas; o primeiro continua visível, enquanto a segunda governa a conexão dos Agentes e a ação Habilitar.

## Continuação

O código está pronto para revisão humana. Não executar trabalho de outro ticket.

### Suggested skills

- `code-review` se houver solicitação de nova revisão após o commit da matriz.
- `resolving-merge-conflicts` somente se surgir conflito ao integrar a branch.
