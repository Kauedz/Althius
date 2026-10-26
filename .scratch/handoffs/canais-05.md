# Handoff — canais 05

## Estado

Ticket `.scratch/canais-althius/issues/05-identidade-do-usuario-nas-ferramentas.md` parcialmente implementado na branch `ralph/canais-05-identidade-do-usuario-nas-ferramentas`, sobre a base empilhada `ralph/canais-06-coordenacao-no-motor-para-execucoes-d`. Status mantido `ready-for-agent`; critérios funcionais que dependem de chamada real ao executor permanecem abertos. Nenhuma migration foi aplicada no Supabase remoto e nenhum deploy foi feito.

## Mudanças

- `supabase/functions/_shared/canal/jwt-usuario.ts`: emite JWT HS256 com `sub` da Conta, `role=authenticated`, `aud=authenticated`, `canal=whatsapp`, `iat` e expiração fixa de 60 segundos. Só recebe segredo do lado servidor; não há logging do token.
- `supabase/migrations/20261206120000_identidade_whatsapp_nas_ferramentas.sql`: registra Conta, Workspace, canal, ferramenta, hash e resultado em tabela privada, sem conteúdo da mensagem. Escrita restrita ao service role.
- Testes Deno do contrato do token e pgTAP da tabela/RPC.
- Não existe ainda catálogo/executor de ferramentas de plataforma conectado a esta função. Ainda é necessário ligar o signer ao executor, chamar uma RPC de tela pelo JWT e verificar a mesma recusa da tela e token expirado. O ticket 10 implementa o catálogo e é o ponto de integração natural.

## Validação

- Red Deno observado antes de criar o módulo: import do signer ausente.
- `deno test supabase/functions/_shared/canal/jwt-usuario.test.ts`: 2/2.
- `PGPORT=55432 bash scripts/pgtap-local.sh pgtap_ca05 supabase/tests/canal_whatsapp_identidade.sql`: 4/4.
- `deno check supabase/functions/*/index.ts`: passou.
- `deno test supabase/functions`: 1800 passed, 0 failed, 39 ignored.
- `PGPORT=55432 bash scripts/pgtap-local.sh pgtap_ca05`: suíte completa passou.
- Frontend `npm run lint` e `npx tsc -b`: passaram; lint mostra avisos já existentes. `npm ci` foi necessário por ausência de `node_modules`.

## Restrições e decisão de processo

- Nenhuma chamada Meta/WhatsApp/Unipile foi feita; sem segredo impresso, alterado ou configurado.
- Nenhum arquivo de Sequência ou Sinais foi alterado.
- A regra fornecida nesta sessão proíbe `git add` e `git commit`; alterações ficam no worktree para a matriz.
- O teste Deno confere `exp=iat+60`, mas não exercita a rejeição de chamada expirada pelo gateway. Nenhuma RPC de negócio foi chamada como usuário; por isso esses dois ACs continuam `[ ]`.

## Suggested skills

- `code-review` para revisão da implementação após integração com o catálogo.
- `tdd` para a integração do executor de ferramentas com as RPCs.
- `supabase` para aplicação futura da migration, conforme autorização e fluxo do projeto.

## Correção da revisão (2026-10-25)

- Renomeada a migration para `20261206120000_identidade_whatsapp_nas_ferramentas.sql`, acima das migrations da base empilhada e da `main`; o SQL permaneceu igual, salvo permissões e validação abaixo. A migration não foi aplicada remotamente.
- PgTAP agora exerce a gravação como `service_role`, confere Conta, Workspace, canal, ferramenta, hash e resultado sem guardar mensagem; cobre hash malformado/nulo, ferramenta e resultado vazios; e confirma que `anon` e `authenticated` não executam a RPC nem leem/escrevem a tabela privada.
- Vermelho → verde: o teste inicialmente falhou ao invocar a RPC por falta de `USAGE` do schema `private` para `service_role`. A migration passou a conceder esse uso. A validação explícita também foi ajustada para rejeitar hash nulo com `22023`. Depois, pgTAP específico passou 21/21.
- Referências ao nome antigo foram atualizadas. Suposição conservadora: as regras aceitam qualquer ferramenta/resultado não vazios dentro dos limites existentes; esta correção testa os limites que a função já declara, sem inventar catálogo para o ticket.
- Suíte pgTAP completa: `PGPORT=55432 bash scripts/pgtap-local.sh pgtap_rvfix_279` — todos os arquivos passaram, incluindo `canal_whatsapp_identidade.sql` (21/21).
- Conferência de nomes: `rg 20261206120000` não encontrou ocorrências; só existe um arquivo em `supabase/migrations` com `20261206120000`.
