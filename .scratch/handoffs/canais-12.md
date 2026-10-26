# Handoff canais-12

Ticket: `.scratch/canais-althius/issues/12-link-de-acao-com-login-e-oauth.md`.

## Entrega

- Migration nova `supabase/migrations/20261122131200_link_de_acao_whatsapp.sql`: cria token privado de ação ligado a Conta, Workspace, ferramenta e hash do payload, com expiração de 15 minutos. RPC autenticada restringe a decisão à Conta vinculada, consome o token uma vez e confere `auth.users.last_sign_in_at` nas últimas 12 horas.
- Página autenticada `/a/<token>` em `projeto-althius-frontend/src/auth/pagina-link-acao.tsx`. A rota preserva o token no retorno do login. Aprovação/recusa são registradas pela RPC. Integrações seguem para `integration-connect` por OAuth; a página não solicita chave de API.
- Cobertura em pgTAP e Vitest; issue marcada done e comentário datado 2026-10-24.

## Testes executados

- Vermelho TDD: pgTAP falhou antes da migration, pois as RPCs ainda não existiam.
- `PGPORT=55432 bash scripts/pgtap-local.sh pgtap_ca12 supabase/tests/whatsapp_link_de_acao.sql` — 8/8.
- `PGPORT=55432 bash scripts/pgtap-local.sh pgtap_ca12` — suíte completa verde.
- Em `projeto-althius-frontend/`: `npx vitest run --maxWorkers=2 src/auth/pagina-link-acao.test.tsx` — 3/3; `npm run lint`; `npx tsc -b`.
- `deno check supabase/functions/*/index.ts`; `deno test supabase/functions` — ambos verdes.
- Migration não aplicada remotamente; nenhuma chamada à Meta/WhatsApp.

## Limite para a próxima sessão

O catálogo do Canal nesta base contém apenas ferramentas de leitura. A infraestrutura de links e a página estão prontas; quando tickets futuros adicionarem ferramentas irreversíveis, elas ainda precisam emitir o link pela RPC e conectar a decisão ao executor da ação de negócio. OAuth já tem caminho dedicado via `integration-connect`.

## Decisões de processo

Seams pré-confirmados pelo Renan: emissão/decisão autenticadas pelas RPCs, inspeção de apresentação na página `/a/<token>`, OAuth via Edge existente. A migration é exclusivamente aditiva. Não apliquei comandos remotos.

A regra superior da sessão proíbe `git add` e `git commit`; por isso as mudanças ficam no worktree para a matriz commitar.

## Suggested skills

- `implement` para continuar um ticket seguinte.
- `tdd` para qualquer nova integração de ferramenta.
- `code-review` para revisar a diff contra a base do próximo ticket.
