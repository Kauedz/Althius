# Handoff — canais-09

## Objetivo

Implementar somente o ticket `.scratch/canais-althius/issues/09-janela-de-24h-e-contador-de-custo.md` na branch `ralph/canais-09-janela-de-24h-e-contador-de-custo`.

## Resultado

- `canal-whatsapp-events` drena as respostas pendentes em ordem antes de tratar uma nova mensagem.
- A migration `20261215102000_janela_e_custo_whatsapp.sql` deduplica status billable por `message_id`, registra separadamente respostas de serviço e templates pelo mês do timestamp do status, e cria alertas únicos quando a soma mensal chega a 800 e 1.000.
- O alerta vai à equipe Althius. Ao atingir 1.000, o Canal continua enviando. O contador fica em tabelas privadas e não lança Créditos.
- O ticket foi atualizado com status `ready-for-human`, três ACs marcados e comentário datado de 2026-10-25.
- Não houve chamada real à Meta ou ao provedor de e-mail, nem migration aplicada remotamente ou deploy.

## Validação

- Red: `deno test -A supabase/functions/canal-whatsapp-events/handler.test.ts` falhou porque enviava somente a primeira resposta pendente.
- Verde focal: handler WhatsApp Deno passou (13/13); pgTAP de `janela_e_custo_whatsapp.sql` passou (15/15).
- `deno test -A` em `supabase/functions`: 1.901 testes passaram, 0 falhas.
- `deno check supabase/functions/canal-whatsapp-events/index.ts`: passou.
- Suíte completa pgTAP em `pgtap_lu2_canais_09`: passou depois de alinhar o retorno SQL a `integer`.

## Revisão

- Eixo Standards: sem achados.
- Eixo Spec: sem achados depois de usar os limites sobre a soma de serviço e templates; em 1.000 não há bloqueio.
- A regra de ambiente proíbe `git add` e `git commit`; todas as alterações ficaram no worktree. `HEAD` e `origin/main` são `ad5bc801`, portanto a revisão usou `git diff origin/main` mais os arquivos novos não rastreados, e não `git diff origin/main...HEAD` (que seria vazio sem commits).

## Próximos passos

- O arquivo de PR está em `/workspace/ralph-wt/_pr/canais-09.md`.
- A migration continua não aplicada; aplicar somente no processo aprovado depois de revisão/CI.

## Suggested skills

- `code-review` para uma nova revisão do diff antes de integrar.
- `tdd` para qualquer correção de seguimento.
