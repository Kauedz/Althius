# 02: Coleta do comitê de compra

**What to build:** quando uma Conta vira Fit, o Ethos busca os 3 perfis das Personas do Playbook (Decisor, Influenciador, Campeão): sozinho quando o interruptor de enriquecimento está em automático, e só sugere quando está em confirmar.

**Blocked by:** 01: Fornecedores da cascata; `playbook-do-workspace` 01; `creditos-e-planos` 03.

**Status:** ready-for-agent (reduzido ao automático: coletar ao virar Fit pelo interruptor e pelas Personas do Playbook; a falha e a lista vazia são duplicadas do B2 da `prospeccao-funcional`; bloqueado por B2, pela promoção do enriquecimento 01 e por playbook-do-workspace 01)

## Pode mexer

- A orquestração do Ethos e a gravação dos Contatos pela função que a frente de Conexões autorizar (combinar antes).

## Não mexa

- Em `create_contact`/`link_contact` sem combinar com a frente de Conexões.
- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Cada pessoa coletada debita 1 crédito.
- [ ] No modo confirmar, nada é coletado sem o clique.
- [ ] Contato duplicado não é criado (unicidade de e-mail e telefone do ticket 27).

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Se o ticket criou migration: `git checkout main`, `git pull`, `npx supabase db push` (na raiz do repositório).
2. Publicar a Edge Function da cascata criada no ticket 01 (`npx supabase functions deploy <nome> --project-ref ycbdilsmydvzezhlymty`).
3. Reiniciar o worker do Hermes (janela 2): fechar com Ctrl+C e rodar de novo o comando de `supabase/functions/_hermes-worker/README.md`.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- 2026-10-07 (reconciliação contra a `main` 59e53a6). Não é duplicado inteiro do B2: os dois só se cruzam no critério 1.
  - Critério 1, cumprido no clique, com dois furos. Reserva `person_collected` vezes o limite (`20261001190000_enriquecimento_e_comite.sql:157-160`), liquida o que achou (`:201-205`) e zero libera (`:211-215`). Deno "handler comite-compra: busca pessoas, classifica personas e debita 1 crédito por contato"; pgTAP "finish_committee_discovery liquida os créditos dos contatos encontrados" (só `lives_ok`, não confere o saldo). Furo 1, sem dono: `account-enrichment/handler.ts:449-470` conta como gravado quem já estava proposto e ignora o `created=false` de `record_proposed_contact` (`:255-262`), então repetir a busca debita de novo as mesmas pessoas. Furo 2, a falha que vira "concluída com 0": duplicado do B2.
  - Critério 2, cumprido só por ausência: o único caminho é o botão (`src/paginas/comite-e-enriquecimento.tsx:299-311` → `src/fonte/supabase-contas.ts:739-754`). O interruptor `acao:enriquecimento` existe (`20260930170000_interruptores_e_tetos.sql:24,61`) e nada o lê. O que o ticket pede não existe: nada dispara o comitê ao virar Fit; o Ethos é só uma descrição (`_shared/orquestracao.ts:97`); a Persona vem do classificador por cargo (`provedor-de-contatos.ts:48-69`), não do Playbook (o campo `personas`, `:31`, nunca é lido).
  - Critério 3, cumprido no banco, sem teste próprio: o aceite casa pelo LinkedIn e vincula (`20261001190000:389-398`); e-mail e telefone são únicos por gatilho (`20260929170000:72-139`).
  - Testes rodados: `deno test --allow-all supabase/functions/account-enrichment/` → 9 passed; pgTAP `enriquecimento_e_comite.sql` ok no CI 37707955273.
  - Falta (agente): coletar sozinho ao virar Fit com o interruptor em automático e teto (`consume_automation_cap` com `acao:enriquecimento`), e só sugerir em confirmar; buscar pelas Personas do Playbook; pgTAP de proposta com LinkedIn já existente. Pergunta ao Nan antes: repetir a busca do comitê pode cobrar de novo quem já foi proposto? (Se não, o conserto do furo 1 vai junto com o B2.)
  - O Status de `creditos-e-planos` 03 que bloqueava este ticket estava defasado: o código está em `20260930170000`.
