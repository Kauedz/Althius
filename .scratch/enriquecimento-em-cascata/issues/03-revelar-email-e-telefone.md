# 03: Revelar e-mail e telefone em cascata

**What to build:** para um Contato, a Althius tenta os fornecedores em ordem até achar o e-mail ou o telefone; cobra só quando acha (2 por e-mail, 5 por telefone) e grava o valor como e-mail ou telefone adicional pelo `set_contact_channels`.

**Blocked by:** 01: Fornecedores da cascata (código pronto, `ready-for-human`: falta só os passos manuais do Nan); `creditos-e-planos` 02 (fechado). Nenhum dos dois bloqueia o critério 3 (lote): ele só depende do B3 da `prospeccao-funcional`, já em `main`.

**Status:** done (reduzido ao critério 3, único em aberto; 1 e 2 são duplicados do B3 da `prospeccao-funcional`, já em `main`, e verificados de novo aqui). O lote é só e-mail: telefone continua recusado em toda a UI e na RPC `begin_reveal_contact` fica para o ticket do PR #263/B5 (ainda não mergeado em `main`), até o Nan decidir o preço.

## Pode mexer

- A ação no Contato e a cascata.

## Não mexa

- Na regra de unicidade de `set_contact_channels` (migration 20260929170000).
- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [x] Não achou: nenhum crédito debitado. (Duplicado do B3 da `prospeccao-funcional`, já em `main`: pgTAP `supabase/tests/revelar_email_so_cobra_valor_novo.sql`, 29/29, e `enriquecimento_e_comite.sql`, 29/29, rodados de novo localmente em 2026-10-24.)
- [x] O valor achado respeita a unicidade entre Contatos. (Mesma evidência acima: `revelar_email_so_cobra_valor_novo.sql` cobre e-mail repetido e e-mail de outro Contato, sem debitar e sem erro.)
- [x] Ação em lote mostra o custo máximo antes de rodar. (Novo nesta sessão: `DialogoRevelarEmailEmLote`, testado em `revelar-email-em-lote.test.tsx`.)

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Se o ticket criou migration: `git checkout main`, `git pull`, `npx supabase db push` (na raiz do repositório).
2. Publicar a Edge Function da cascata (`npx supabase functions deploy <nome> --project-ref ycbdilsmydvzezhlymty`).
3. Guardar os segredos dos fornecedores pagos, se houver, direto no PowerShell (`npx supabase secrets set <NOME>=... --project-ref ycbdilsmydvzezhlymty`), nunca no chat.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- 2026-10-07 (reconciliação contra a `main` 59e53a6):
  - Critério 1 (não achou, não debita): cumprido no sentido literal (`20261001190000_enriquecimento_e_comite.sql:616-619`; Deno "handler revelar-contato: quando NÃO acha, não debita nenhum crédito (0 créditos)"; pgTAP "ZERO créditos foram debitados quando o dado não foi encontrado"). Mas achar e não gravar debita 2 (o `coalesce` em `:605,610`, liquidando antes em `:600`), e a falha do actor aparece como "não encontrado". Tudo isso está nos critérios 2 e 4 do B3: duplicado.
  - Critério 2 (unicidade entre Contatos): parcial. O gatilho barra (`20260929170000:83,90`), mas o 23505 desfaz tudo, o handler devolve 500 (`account-enrichment/handler.ts:578-582`) e a reserva fica `reserved` até a faxina. Sem teste. O B3 não lista esse caso: registrado como acréscimo nos Comments do B3. Duplicado.
  - Critério 3 (lote com custo máximo): não existe ação em lote; o botão é por linha (`src/paginas/tabela-de-contatos.tsx:145`). O B3 não cobre.
  - Telefone: o ticket pede 5 créditos por telefone, mas a spec da `prospeccao-funcional` deixou o telefone de fora e nenhum actor traz telefone (`20261001170000:279`).
  - Testes rodados: `deno test --allow-all supabase/functions/account-enrichment/` → 9 passed; pgTAP `enriquecimento_e_comite.sql` e `varios_emails_e_telefones_por_contato.sql` ok no CI 37707955273.
  - Falta (agente, depois do B3): a ação em lote com o custo máximo antes de rodar, com teste. Pergunta ao Nan: o telefone vira `wontfix` até existir um actor validado?
- 2026-10-08 (B3 da `prospeccao-funcional`, branch `ralph/B3-revelar-email`): os critérios 1 e 2 estão cobertos lá. Não achou, repetido ou e-mail de outro Contato debita zero e libera a reserva, sem erro (pgTAP `revelar_email_so_cobra_valor_novo.sql`). O e-mail novo entra no primeiro lugar livre, principal ou `contact_emails`. Pendente, que vira ticket próprio (decisão do Renan): `begin_reveal_contact` ainda aceita `telefone` por RPC direta e reserva 5 créditos. Essa RPC precisa recusar `telefone` até o Nan decidir o preço. O handler e a tela já recusam.
- 2026-10-24 (branch `ralph/enriquecimento-03-lote-email-custo-maximo`, a partir da `main` 515c2eb): fechado o critério 3, único em aberto.
  - Confirmados de novo os critérios 1 e 2, já em `main` pelo B3: `PGPORT=55432 bash scripts/pgtap-local.sh pgtap_enriquecimento_03 supabase/tests/revelar_email_so_cobra_valor_novo.sql` → 29/29; `enriquecimento_e_comite.sql` → 29/29. Nenhuma migration nova precisou ser escrita.
  - Telefone: o PR #263 (B5, branch `ralph/b5-revelar-recusa-telefone-na-rpc`) ainda não está em `main` nesta data; até ele mergear, `begin_reveal_contact` por RPC direta continua aceitando `telefone`, só a tela e o handler recusam. A UI nova desta sessão (lote) nunca oferece telefone: só chama `revelarContato(id, 'email')`, hardcoded.
  - Lote: `DialogoRevelarEmailEmLote` (`src/paginas/revelar-email-em-lote.tsx`), aberto pelo novo botão "Revelar E-mail em lote" em `src/paginas/contatos.tsx`, visível só com `fonte.revelarContato` e pelo menos um Contato marcado. A seleção é um checkbox novo por linha, embutido na célula Nome de `TabelaDeContatos` (props opcionais `selecionados`/`aoAlternarSelecao`, sem checkbox quando não usadas: `detalhe-conta.tsx` não ganhou a caixa). O custo máximo é calculado no cliente, sem RPC: `2 × quantidade de selecionados sem e-mail` (quem já tem e-mail entra na seleção mas custa 0); só chama `fonte.revelarContato(id, 'email')` depois do clique em "Confirmar e Revelar", um Contato de cada vez, e a falha de um não trava os demais. Extraída `mensagemDaRevelacaoDeEmail` de `comite-e-enriquecimento.tsx` para o texto do resultado não duplicar entre a ação por linha e a em lote (achado da revisão própria).
  - Testes novos: `revelar-email-em-lote.test.tsx` (4 testes: sem seleção some o botão; mostra o custo máximo antes de rodar sem chamar `revelarContato`; só roda e só para quem precisa depois da confirmação; sem e-mail novo não debita). Vermelho confirmado antes da implementação (3 de 4 falhavam). Testes existentes tocados só por reuso do componente (`tabela-de-contatos.tsx`, `comite-e-enriquecimento.tsx`): nenhum teste existente mudou, todos continuam verdes (`contatos.test.tsx`, `contas.test.tsx`, `arquivar-e-apagar.test.tsx`, `comite-e-enriquecimento-revelar.test.tsx`, `cotacao-revelacao.test.tsx`, `comite-e-enriquecimento-nao-recobrar.test.tsx`, `detalhe-conta.test.tsx`). `npx tsc -b` e `npx oxlint` sem erro.
  - Sem migration, sem Edge Function e sem segredo novo: nenhum passo manual do Nan para esta entrega.
- 2026-10-24 (correção da revisão cruzada Codex; Status: done, AC 3 revalidado): corrigidos os dois achados. O custo máximo agora soma `cotarRevelacaoContato` da Fonte; confirmação bloqueada durante cotação pendente, falha, indisponibilidade ou impedimento. Durante revelação, Cancelar desabilitado, X oculto e Escape/clique fora bloqueados, preservando o resultado até concluir. Telefone continua fora. Testes vermelhos reproduziram cotação pendente e fechamento indevido antes das respectivas correções; teste adicional protege créditos ilimitados. Node 22: Vitest dos arquivos tocados e `contatos*`/consumidores: 48/48 (7 arquivos); oxlint sem erros (com avisos); tsc -b sem erros. Suíte pgTAP local completa em `pgtap_enriquecimento_03_correcao`: 152 arquivos, 5333 asserções verdes. Nenhuma migration ou teste antigo alterado; sem passos de apply/deploy/segredos do Nan. Correções sem commit, conforme instrução da matriz. Evidências em `.scratch/handoffs/enriquecimento-03.md`.
