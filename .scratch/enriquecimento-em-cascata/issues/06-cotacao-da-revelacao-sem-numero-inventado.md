# 06: A cotação da revelação nunca mostra número inventado

**What to build:** todo lugar da interface que mostra quanto custa revelar um canal de Contato (modal "Revelar E-mail" em `comite-e-enriquecimento.tsx`, lote em `revelar-email-em-lote.tsx`, textos e ajuda) mostra só o valor que veio da cotação do backend (`quote_reveal_contact` via `cotarRevelacaoContato`) no Workspace operacional. Sem cotação (pendente, erro, indisponível ou Fonte sem `cotarRevelacaoContato`), a tela não mostra número nenhum e não deixa confirmar: diz que a cotação não está disponível. Nenhuma constante de preço (2, 5, `CUSTO_POR_EMAIL` etc.) decide o que aparece para o cliente no Workspace operacional. Na Demonstração, a Fonte simulada continua com preços fixos, e isso deve estar explícito como dado de demonstração.

**Blocked by:** nenhum. `quote_reveal_contact` e `cotarRevelacaoContato` já estão em `main` (enriquecimento 03, PR #268).

**Status:** ready-for-agent (criado em 2026-10-25 a pedido do Renan: "a cotação da revelação na tela não pode ser inventada").

## Pode mexer
- `projeto-althius-frontend/src/paginas/comite-e-enriquecimento.tsx`, `revelar-email-em-lote.tsx`, os testes deles, `src/fonte/contas-tipos.ts` (só comentário/tipo), a ajuda `src/ajuda/05-contas-e-comite.md` se ela afirmar um preço como fato do Workspace do cliente.

## Não mexa
- Preço de telefone: é decisão do Renan (telefone segue fora, sem cotação e sem revelação). Não crie preço novo nem migration de preço.
- `begin_reveal_contact`, `quote_reveal_contact` e a cobrança no banco (só leia). Arquivos de Sinais e de sequência.
- Testes existentes só ganham casos; não apague asserções.

## Critérios
- [ ] Inventário no `## Comments`: cada lugar que mostra custo de revelação, de onde vem o número e o que foi mudado.
- [ ] Modal individual: com cotação, mostra exatamente `creditos` e `saldo` da cotação (teste com um preço diferente de 2, ex. 7); `jaEncontrado` mostra que não custa nada; sem cotação/erro, nenhum número e botão de confirmar desabilitado (Vitest).
- [ ] Lote: o máximo é a soma das cotações (já coberto em `revelar-email-em-lote.test.tsx`; acrescentar caso se faltar), nunca `quantidade × constante`.
- [ ] Nenhum texto mostrado no Workspace operacional afirma um preço fixo que não venha da cotação (teste ou grep documentado).
- [ ] lint, tsc e a suíte Vitest verdes.
