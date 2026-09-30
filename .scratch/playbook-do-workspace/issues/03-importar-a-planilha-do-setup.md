# 03: Importar a planilha do playbook do setup

**What to build:** o Administrador envia o `.xlsx` no modelo do setup e vê a prévia seção por seção antes de gravar; as abas conhecidas viram seções, as desconhecidas aparecem como "não importadas", e a aba Base de Pesquisa vai para a importação por CSV de Contas-alvo, em Descoberta.

**Blocked by:** 01: Seções do Playbook no banco; 02: Tela do Playbook.

**Status:** ready-for-agent

## Pode mexer

- Leitura do `.xlsx` no navegador com uma biblioteca de planilha (registrar a escolha e a versão no PR) ou numa Edge Function nova `playbook-import`, no padrão de `csv-import`.
- O mapeamento fixo aba → seção num módulo próprio, com teste.
- A passagem da Base de Pesquisa para a importação de Contas-alvo que já existe (CRM-07), sem alterar o `csv-import`.

## Não mexa

- Na Edge Function `csv-import` e nas funções de importação (CRM-07), a não ser para chamá-las.
- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [x] Prévia antes de gravar; nada é gravado sem confirmação.
- [x] Aba desconhecida listada, nunca descartada em silêncio.
- [x] Base de Pesquisa vira Contas-alvo pelo fluxo de importação existente e cai em Descoberta (quando o kanban existir).
- [x] Teste com uma planilha de exemplo sem dado pessoal, criada no próprio teste.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Se for Edge Function: `npx supabase functions deploy playbook-import --project-ref ycbdilsmydvzezhlymty`.
2. Importar a planilha real de um cliente e conferir a prévia (dado de cliente: só o Nan faz com a planilha real).

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
