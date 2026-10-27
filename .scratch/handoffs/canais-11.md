# Handoff — canais 11

Ticket `.scratch/canais-althius/issues/11-confirmacao-por-botao-ou-sim.md`. Implementada a infraestrutura de confirmação reversível em `supabase/functions/_shared/canal/confirmacao.ts` e migration `supabase/migrations/20261122131100_confirmacao_reversivel_whatsapp.sql`. A migration mantém apenas o hash do token e do payload, escopa por Conta, Workspace e ferramenta, expira em 10 minutos e consome a decisão atomicamente uma vez. O hash segue `private.approval_payload_hash(jsonb)` dentro do Postgres; a tabela é acessível somente pelas RPCs `security definer`. O helper formata o resumo e a cotação em Créditos antes do comando SIM/NAO. A integração ao executor permanece para tickets que introduzirem ferramentas reversíveis; o catálogo da base do ticket 10 ainda só contém leituras, portanto o critério de fluxo humano permanece desmarcado e o ticket segue `ready-for-agent`.

Seams pré-confirmados pela instrução headless: helper de apresentação/parse do SIM e as RPCs service-role testadas por pgTAP. Assunção: o valor da cotação é produzido por RPC existente da ação paga, passado ao helper, e nunca inferido pelo modelo.

Revisão: mudanças avaliadas contra ticket 11, spec, decisões W3/D3 e ADR-0027; nenhum arquivo protegido de Sequências ou Sinais foi editado. O sandbox desta sessão não permite `git add` ou `git commit`; alterações ficam no worktree para a matriz.

Validação: Deno focal 2/2; `deno check supabase/functions/*/index.ts` verde; `deno test supabase/functions` 1.818 passaram, 0 falhas, 39 ignorados. Suíte pgTAP completa `PGPORT=55432 bash scripts/pgtap-local.sh pgtap_ca11` verde; pgTAP focal `whatsapp_confirmacao_reversivel.sql` 14/14. Nenhuma chamada remota, deployment ou aplicação de migration.

## Suggested skills

- `code-review` para revisar o diff em relação à base do ticket.
- `tdd` se a próxima etapa ligar o catálogo a ferramentas reversíveis ou acrescentar fluxo para múltiplos tokens pendentes.
