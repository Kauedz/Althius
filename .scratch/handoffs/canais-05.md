# Handoff — canais 05

## Estado

Ticket `.scratch/canais-althius/issues/05-identidade-do-usuario-nas-ferramentas.md` parcialmente implementado na branch `ralph/canais-05-identidade-do-usuario-nas-ferramentas`, sobre a base empilhada `ralph/canais-06-coordenacao-no-motor-para-execucoes-d`. Status mantido `ready-for-agent`; critérios funcionais que dependem de chamada real ao executor permanecem abertos. Nenhuma migration foi aplicada no Supabase remoto e nenhum deploy foi feito.

## Mudanças

- `supabase/functions/_shared/canal/jwt-usuario.ts`: emite JWT HS256 com `sub` da Conta, `role=authenticated`, `aud=authenticated`, `canal=whatsapp`, `iat` e expiração fixa de 60 segundos. Só recebe segredo do lado servidor; não há logging do token.
- `supabase/migrations/20261122130500_identidade_whatsapp_nas_ferramentas.sql`: registra Conta, Workspace, canal, ferramenta, hash e resultado em tabela privada, sem conteúdo da mensagem. Escrita restrita ao service role.
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
