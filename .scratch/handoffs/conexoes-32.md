# Handoff — conexoes-32

## Estado

Ticket implementado no worktree `ralph/conexoes-32-retirar-a-integracao-revoga-no-app`, baseado em `origin/main`. A mudança de código está local e sem commit: a regra desta sessão proíbe `git add`/`git commit` por limitação do sandbox. Ticket e spec estão em `.scratch/conexoes-funcionais/issues/32-retirar-a-integracao-revoga-no-app.md` e `.scratch/conexoes-funcionais/spec.md`.

## Implementação

- Retirada operacional chama `integration-connect` (`action: retirar`), que usa o revogador compartilhado com `desconectar` e então apaga Acessos/habilitação.
- Resultado enumera revogado, não suportado, falha ou sem token OAuth; fica armazenado sem segredos e pode ser consultado apenas pelo próprio participante após reload.
- Migration nova `supabase/migrations/20261211131000_revogar_acessos_ao_retirar_integracao.sql`. Não foi aplicada nem publicada.
- RPC antiga de retirada revogada para `authenticated`; a RPC final é `service_role`, com validação de Administrador ativo.
- Testes usam rede falsa; nenhum fornecedor real foi chamado.

## Verificações

- pgTAP específico e suíte completa passaram; comandos anotados no ticket.
- Deno das Edge Functions passou (1.847 testes antes de adicionar o caso de endpoint ausente; teste direcionado atualizado passou com 4 casos). `deno check` da função passou.
- Vitest direcionado de Conexões passou (12 testes), a suíte completa passou (1.989 testes, 4 ignorados), lint e `tsc -b` passaram. A primeira execução completa teve dois timeouts em outro arquivo, passou isolado e a repetição completa passou.
- A tentativa literal `deno test -A` na raiz coleta arquivos de frontend fora da configuração DOM e falha com erros de tipo; `deno test -A supabase/functions` passou.

## Próximo passo

Depois, a pessoa responsável pode aplicar a migration, publicar `integration-connect` e conferir a revogação com uma conta real do fornecedor. Não houve mudança remota.

## Skills sugeridas

- `code-review` para revisar o diff final contra ticket e padrões.
- `migrations` (seguir `docs/agents/migrations.md`) se for aplicar a migration.
- `implement` se algum apontamento pedir ajuste de código.
