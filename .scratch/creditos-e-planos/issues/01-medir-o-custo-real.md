# 01: Medir o custo real de cada ação

**What to build:** cada Execução de Agente grava os tokens e o modelo usados; cada execução de actor do Apify grava o custo que o Apify devolve; um relatório por Workspace e por mês mostra o custo real por tipo de ação. É o dado para fechar a tabela de créditos e as cotas dos planos.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

## Pode mexer

- Migration aditiva com uma tabela privada de custos por ação e a função de relatório (só Administrador).
- A ponte, o worker do Hermes e as Edge Functions que chamam o Apify, só para registrar o custo.

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [x] Custo gravado por ação, com fornecedor, modelo ou actor, unidades e valor em dólar.
- [x] Relatório mensal por tipo de ação e por Workspace.
- [x] Sem dado pessoal na tabela de custos.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Aplicar a migration: `git checkout main`, `git pull`, `npx supabase db push` (na raiz do repositório).
2. Publicar as funções alteradas (`agent-conversation` e as do Apify) e reiniciar o worker do Hermes.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
