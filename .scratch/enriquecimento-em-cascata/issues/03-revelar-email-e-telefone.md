# 03: Revelar e-mail e telefone em cascata

**What to build:** para um Contato, a Althius tenta os fornecedores em ordem até achar o e-mail ou o telefone; cobra só quando acha (2 por e-mail, 5 por telefone) e grava o valor como e-mail ou telefone adicional pelo `set_contact_channels`.

**Blocked by:** 01: Fornecedores da cascata; `creditos-e-planos` 02.

**Status:** ready-for-agent (reduzido ao lote com o custo máximo antes, bloqueado pelo B3; os critérios 1 e 2 e a gravação pelo `set_contact_channels` são duplicados do B3 da `prospeccao-funcional`; telefone espera decisão do Nan)

## Pode mexer

- A ação no Contato e a cascata.

## Não mexa

- Na regra de unicidade de `set_contact_channels` (migration 20260929170000).
- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Não achou: nenhum crédito debitado.
- [ ] O valor achado respeita a unicidade entre Contatos.
- [ ] Ação em lote mostra o custo máximo antes de rodar.

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
