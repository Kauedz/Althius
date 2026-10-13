# 02: Marca: nenhuma menção a Apify/actor para o usuário, com guardas de teste

**What to build:** Trocar os textos que vazavam o fornecedor de coleta por palavras do produto, neutralizar o dado existente e travar com testes de guarda (backend e frontend).

**Blocked by:** 01 (a ordem é a das fatias da spec).

**Status:** ready-for-human

Commit: fatia 1

## Pode mexer

- `_shared/marca.ts` e os handlers que montavam mensagem de falha da fonte.
- Frontend: rótulo "Receita Federal" e tipos de fonte.
- Migração `20261013120000_marca_neutra_nos_dados.sql`.

## Não mexa

- O motor (`_shared/cascata-de-sinais/motor.ts`) e os tipos, salvo o que o ticket nomeia.
- Migrações já aplicadas: conserta-se com migração nova.
- Segredos e Supabase Auth; nada é aplicado em produção pelo agente.

## Critérios

- [x] Nenhum texto lido pelo usuário ou pelo Hermes cita Apify ou "actor" (guardas deno e vitest).
- [x] O dado existente em `receita_data`, `source_provider` e `known_price` fica neutro.
- [x] O prompt do Hermes carrega a regra de marca.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Aplicar `20261013120000_marca_neutra_nos_dados.sql` (reescreve dados em produção: confirmar antes com o Nan que pode neutralizar `receita_data->>'fonte'` e `proposed_contacts.source_provider`).
2. Publicar `account-discovery`, `account-enrichment`, `contact-photo-lookup`, `signal-scan` (inclui `bfef6c3`) e `signal-runner`; publicar o frontend.
3. Segredo canônico: `APIFY_TOKEN` (e `APIFY_TOKEN_2` a `_5` para rodízio). **Apagar `APIFY_API_TOKEN`** (nenhum código o lê). Nunca imprimir o valor.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4. Aplicação de migração: `docs/agents/migrations.md`.

## Comments

- Feito na PR https://github.com/Kauedz/Althius/pull/189 (rascunho; sem merge, nada aplicado em produção).
