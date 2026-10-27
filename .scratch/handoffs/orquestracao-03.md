# Handoff — orquestracao-03

## Objetivo e resultado

Implementar somente o ticket `.scratch/orquestracao/issues/03-execucoes-presas-ou-com-falha.md`. A implementação está no worktree atual, branch `ralph/orquestracao-03-execucoes-presas-ou-com-falha`, sem commit por regra explícita do ambiente. O resumo completo do escopo e das regras está no ticket e no diff.

## Decisões adotadas

Renan pré-autorizou o padrão documentado no ticket: Aviso só para Administradores ativos; N = 3; não pausar a Rotina; Administrador pode tentar de novo Execução de Rotina; prazo de 10 minutos. Não há notificação do navegador. O teste usa Supabase falso; nenhuma chamada ao Hermes/provedor real foi feita.

Os seams pré-confirmados foram a superfície pública SQL (`expire_stale_agent_runs`, `list_agent_run_attention`, `retry_agent_run`, Aviso de Workspace) e a Fonte/tela de Atividade via Supabase falso. A spec `.scratch/orquestracao/spec.md` não existe; o próprio ticket contém What to build, critérios, desenho e decisões necessárias. O bloqueio do ticket 02 está entregue em `origin/main` (`20261012143547_reserva_de_creditos_na_execucao.sql`).

## Verificações

- pgTAP direcionado: `execucoes_presas_ou_com_falha.sql` — 25/25.
- pgTAP completo: terminou verde, incluindo a suíte nova e os testes do ticket 02.
- Vitest direcionado: os dois arquivos do ticket — 4/4.
- Vitest completo: 2.001 passaram, 4 ignorados, 1 falhou em `src/paginas/configuracoes/personas.test.tsx`; o teste desse arquivo passou isoladamente, 11/11. A falha aconteceu durante a suíte completa em arquivo não alterado.
- `npm run lint`: código zero, avisos existentes em vários arquivos.
- `npx tsc -b`: código zero.
- `git diff --check`: sem erro.
- TDD: novo teste da tela falhou primeiro porque não mostrava o erro da RPC; após correção passou. Revisão manual do diff contra `origin/main`: sem outros achados. O HEAD não avançou porque o sandbox impede `git add`/`git commit`.

## Pendências operacionais

Os AC do job no cron remoto e da retomada da agenda de Rotina continuam desmarcados no ticket, com nota de verificação humana. Após CI verde, aplicar a migration conforme `docs/agents/migrations.md`, confirmar `althius-stale-agent-runs` em `cron.job`, e conferir o cron da Rotina. Não publicar Edge Function; nenhuma foi alterada. Com o worker desligado, a validação visual real exige abrir pedido, aguardar mais de 10 minutos e conferir Atividade; o Nan só precisa desligar e ligar o worker.

## Artefatos

- Ticket atualizado: `.scratch/orquestracao/issues/03-execucoes-presas-ou-com-falha.md`
- PR title/body (rascunho): `/workspace/ralph-wt/_pr/orquestracao-03.md`
- Migration nova: `supabase/migrations/20261211132000_execucoes_presas_ou_com_falha.sql`
- pgTAP: `supabase/tests/execucoes_presas_ou_com_falha.sql`

## Correção de revisão — rfix1

- Removido o ramo impossível `started_at === undefined`; Execuções `queued` sem início usam `created_at` para mostrar o tempo parada. A fixture de `running` agora fornece `started_at`.
- A RPC `list_agent_run_attention` informa `can_view_conversation` por linha. A Atividade mantém o link da Rotina para o dono e o oculta para Administrador que só pode ver a Execução da Rotina.
- No conflito de unicidade de `retry_agent_run`, uma colisão concorrente de `client_request_id` agora conserva o erro `request id already used`; conflito de Execução aberta continua `conversation busy`.
- TDD: Vitest falhou antes para o link indevido; pgTAP falhou antes porque a RPC ainda não retornava a permissão de leitura. Depois das correções, Vitest direcionada 6/6 e pgTAP 28/28.
- Verificação final: pgTAP local completo verde; Deno check e testes (1.868); lint; `tsc -b`; Vitest completa (2.005 passaram, 4 ignorados); build. Lint/build emitiram avisos já existentes de lint, `VITE_GOOGLE_CLIENT_ID` vazio e tamanho dos chunks.
- Decisão: link é exibido apenas quando a linha da RPC confirma que a pessoa autenticada é dona da Conversa; o Administrador mantém acesso ao item de Atividade da Rotina, sem navegação para a Conversa privada de outra pessoa.

## Suggested skills

Para uma sessão que continuar: `code-review` (revisar `origin/main` contra o diff do worktree e atender achados), `tdd` (se ajustar comportamento, red primeiro), `implement` (se concluir pendências de código do ticket) e `handoff` (ao transferir de novo). O ticket está pronto para revisão humana; o handoff não duplica o spec ou o patch.
