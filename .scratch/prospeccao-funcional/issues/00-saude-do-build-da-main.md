# 00: Saúde do build da main

**What to build:** a `main` passa, do zero, nos mesmos checks que o CI exige antes de qualquer outro ticket desta pasta entrar nela. A auditoria deixou esta seção em branco. Este ticket é o registro da rodada, e o conserto do que ela mostrar vermelho.

**Blocked by:** None (pode começar agora). Nenhum outro ticket de `.scratch/prospeccao-funcional/` entra na `main` antes deste estar verde.

**Status:** closed

- [x] `npm run lint` em `projeto-althius-frontend` passa.
- [x] `npx tsc -b` em `projeto-althius-frontend` passa.
- [x] `npx vitest run` em `projeto-althius-frontend` passa.
- [x] `deno check supabase/functions/*/index.ts` passa, na raiz do repositório.
- [x] `deno test supabase/functions` passa.
- [x] O pgTAP roda num banco criado vazio, com todas as migrations aplicadas na ordem, e fecha o plano sem falha. O caminho do CI é o job `banco` de `.github/workflows/ci.yml` (`supabase start` sem os serviços que o job exclui, depois `supabase test db`).
- [x] O que falhar é consertado na causa. Asserção que descreve um furo dos tickets A1 a C3 permanece: o conserto desse furo é o ticket dela.
- [x] Se os seis já passam, o comentário deste ticket cola o resultado de cada um e o fecha.

## Resultado (2026-10-02)

Nada falhou. A `main` em `34ed683` já passa nos seis checks. Não houve conserto de código. O CI [run 37023681742](https://github.com/Kauedz/Althius/actions/runs/37023681742) fechou os três jobs com sucesso.

| Check | Resultado |
| --- | --- |
| `npm run lint` | Local: exit 0. oxlint, 334 arquivos, 49 avisos, 0 erros. CI: passo `npm run lint` em 1s. |
| `npx tsc -b` | Local: exit 0, sem diagnóstico. CI: `npm run build` em 21s (o build inclui o typecheck). |
| `npx vitest run` | CI: `npm test` (`vitest run`) em 467s, sucesso. A rodada local nesta máquina foi interrompida com os arquivos já impressos verdes; o resultado que fecha o ticket é o do CI, no mesmo commit. |
| `deno check supabase/functions/*/index.ts` | Local: exit 0, Deno 2.9.7, todas as `index.ts` das funções. CI: 5s. |
| `deno test supabase/functions` | Local: 710 passed, 0 failed (37s). CI: 12s. |
| pgTAP do zero | CI, job Banco: `supabase start` com as migrations do zero em 127s e `supabase test db` em 9s, os dois com sucesso. Nesta máquina não há Docker, então o `supabase start` local não rodou. O caminho que o ticket pede é esse job. |

## Pode mexer

- O mínimo que um desses seis checks apontar: teste quebrado, tipo, lint, migration que não aplica do zero, função Deno que não checa.
- Um pgTAP novo, se o conserto for uma migration nova.

## Não mexa

- Comportamento de produto dos tickets A1 a C3. Em especial o id `novo-…` do Monitoramento, os fallbacks simulados, o estado dos actors, `cnpj-receita`, o comitê, o revelar, o apagamento e a ativação da Sequência.
- Conexões, InMail, seam de Canal, Stripe, sinais jurídicos, status das outras specs.
- `grant_credits`, saldo, teto e plano.
- Teste antigo, salvo quando o próprio check estiver vermelho por causa desse teste e o conserto for alinhar o teste ao comportamento que a `main` já tem. Não use este ticket para autorizar o que só o A2 autoriza.

## Migration

Só se o banco do zero não aplicar. Uma migration, timestamp UTC maior que `20261002112000`, com pgTAP próprio. A migration já aplicada fica como está.

## Comments

- 2026-10-07 (reconciliação): a `main` atual (59e53a6, depois do PR #150) também passa nos seis checks. CI [run 37707955273](https://github.com/Kauedz/Althius/actions/runs/37707955273), os três jobs com sucesso: pgTAP do zero com 57 arquivos e 2536 testes (`Result: PASS`), vitest com 107 arquivos verdes, `deno check` e `deno test` com 710 passed, 0 failed. Rótulo trocado de `done` para `closed`, o do vocabulário (`docs/agents/triage-labels.md`).
