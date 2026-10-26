# 06: A cotação da revelação nunca mostra número inventado

**What to build:** todo lugar da interface que mostra quanto custa revelar um canal de Contato (modal "Revelar E-mail" em `comite-e-enriquecimento.tsx`, lote em `revelar-email-em-lote.tsx`, textos e ajuda) mostra só o valor que veio da cotação do backend (`quote_reveal_contact` via `cotarRevelacaoContato`) no Workspace operacional. Sem cotação (pendente, erro, indisponível ou Fonte sem `cotarRevelacaoContato`), a tela não mostra número nenhum e não deixa confirmar: diz que a cotação não está disponível. Nenhuma constante de preço (2, 5, `CUSTO_POR_EMAIL` etc.) decide o que aparece para o cliente no Workspace operacional. Na Demonstração, a Fonte simulada continua com preços fixos, e isso deve estar explícito como dado de demonstração.

**Blocked by:** nenhum. `quote_reveal_contact` e `cotarRevelacaoContato` já estão em `main` (enriquecimento 03, PR #268).

**Status:** ready-for-human (o escopo editável não inclui todos os textos e a Fonte simulada exigidos pelos critérios; suíte Vitest completa não concluiu dentro de 600s).

## Pode mexer
- `projeto-althius-frontend/src/paginas/comite-e-enriquecimento.tsx`, `revelar-email-em-lote.tsx`, os testes deles, `src/fonte/contas-tipos.ts` (só comentário/tipo), a ajuda `src/ajuda/05-contas-e-comite.md` se ela afirmar um preço como fato do Workspace do cliente.

## Não mexa
- Preço de telefone: é decisão do Renan (telefone segue fora, sem cotação e sem revelação). Não crie preço novo nem migration de preço.
- `begin_reveal_contact`, `quote_reveal_contact` e a cobrança no banco (só leia). Arquivos de Sinais e de sequência.
- Testes existentes só ganham casos; não apague asserções.

## Critérios
- [x] Inventário no `## Comments`: cada lugar que mostra custo de revelação, de onde vem o número e o que foi mudado.
- [x] Modal individual: com cotação, mostra exatamente `creditos` e `saldo` da cotação (teste com um preço diferente de 2, ex. 7); `jaEncontrado` mostra que não custa nada; sem cotação/erro, nenhum número e botão de confirmar desabilitado (Vitest).
- [x] Lote: o máximo é a soma das cotações (já coberto em `revelar-email-em-lote.test.tsx`; acrescentar caso se faltar), nunca `quantidade × constante`.
- [ ] Nenhum texto mostrado no Workspace operacional afirma um preço fixo que não venha da cotação (pendente verificação humana: `src/ajuda/02-creditos.md` não está em Pode mexer).
- [ ] Na Demonstração, os valores fixos da Fonte simulada estão identificados explicitamente como ilustrativos (pendente verificação humana: `src/fonte/simulada-contas.ts` não está em Pode mexer).
- [ ] lint, tsc e a suíte Vitest verdes (lint e tsc passaram; a suíte completa excedeu 600s, exit 124, após reportar uma falha em `src/mockups/configuracoes/configuracoes.test.tsx`; verificação completa pendente).

## Comments

- 2026-10-25 — Inventário de custo da revelação: o modal individual em `src/paginas/comite-e-enriquecimento.tsx` recebe `creditos` e `saldo` de `cotarRevelacaoContato`; cotação pendente/erro/ausente não expõe preço e impede confirmar. O lote em `src/paginas/revelar-email-em-lote.tsx` soma `creditos` das cotações individuais e bloqueia confirmar se alguma cotação falhar. `src/ajuda/05-contas-e-comite.md` deixou de apresentar preços fixos e agora informa que o custo é cotado antes da confirmação.
- 2026-10-25 — Fora da lista `Pode mexer`: `src/ajuda/02-creditos.md` ainda informa e-mail por 2 créditos e telefone por 5 na ajuda geral, acessível no Workspace operacional; `src/fonte/simulada-contas.ts` precisa identificar como ilustrativos os valores fixos da Demonstração. Mantive ambos sem alterações. Os dois critérios correspondentes ficam pendentes de verificação humana e ampliação do escopo.
- 2026-10-25 — TDD: as regressões de preço cotado, falha/ausência de cotação, lote e ausência de método foram executadas contra `origin/main` antes da implementação e falharam; depois passaram com a implementação. Testes focados finais e suíte completa, lint e `tsc -b`: resultados registrados após execução nesta sessão.
- 2026-10-25 — Verificações desta sessão: `npx vitest run --maxWorkers=2 src/paginas/comite-e-enriquecimento-revelar.test.tsx src/paginas/cotacao-revelacao.test.tsx src/paginas/revelar-email-em-lote.test.tsx` passou (3 arquivos, 15 testes); `npm run lint` passou com avisos; `npx tsc -b` passou. `timeout 600s npx vitest run --maxWorkers=2` terminou com exit 124; antes do limite, reportou uma falha em `src/mockups/configuracoes/configuracoes.test.tsx` (teste de revisão do ICP), então a suíte completa não está verde. A revisão Standards não encontrou achados; a revisão Spec confirmou apenas as duas pendências fora de `Pode mexer` acima.
