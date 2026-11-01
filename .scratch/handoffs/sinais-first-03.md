# Handoff — sinais-first-03

## Estado

Ticket 03 implementado no worktree `ralph/sinais-first-03-icp-no-prompt-do-plano-do-sinal`, sobre a base do ticket 01. O sandbox desta sessão proíbe `git add`/`git commit`; as alterações ficaram no worktree para a matriz commitar.

## O que mudou

- `signal-plan` lê `public.get_my_workspace_icp` com o JWT da pessoa, sem mudar a RPC.
- O prompt recebe setor, porte, geografia, papéis e textos do ICP como dados delimitados. O sistema instrui a IA a usar esse contexto para completar critérios omitidos, sem mudar a intenção/tipo; Briefing e ICP são dados não confiáveis e fonte, preço, escopo e limite permanecem do servidor.
- Ausência ou falha da leitura usa o fluxo sem ICP.
- O ticket registra a verificação real com provedor e CI como pendente humana. Nenhum fornecedor real foi chamado.

## Verificações

- Red antes da implementação: `deno test -A supabase/functions/signal-plan/handler.test.ts` falhou porque `Db` não tinha `lerIcp`.
- Verde: `deno test -A supabase/functions/signal-plan` — 26 testes passaram.
- `deno check supabase/functions/signal-plan/index.ts` passou.
- `git diff --check` passou.
- `deno test -A` na raiz falhou porque tentou compilar os testes Vitest do frontend como testes Deno; erros de dependências/configuração do frontend. O teste Deno direcionado à função passou.

## Próximos passos

- A revisão de código encontrou e removeu duplicação na sanitização de Briefing/contexto.
- A confirmação de que um provedor real gera critérios que refletem setor, porte e geografia segue pendente humana; não é bloqueio para o código local.
- CI nos três jobs também segue pendente humana.
- Sem migration e sem passos manuais de publicação neste ticket. Esperar revisão humana antes do deploy, seguindo o fluxo existente.

## Artefatos

- Ticket: `.scratch/sinais-first/issues/03-icp-no-prompt-do-plano-do-sinal.md`
- Spec: `.scratch/sinais-first/spec.md`
- ADR: `docs/adr/0033-sinais-first.md`
- Descrição do PR: `/workspace/ralph-wt/_pr/sinais-first-03.md`

## Skills sugeridas

- `code-review` para revisar qualquer alteração posterior antes do PR.
- `implement` se houver correção necessária após a confirmação humana.
