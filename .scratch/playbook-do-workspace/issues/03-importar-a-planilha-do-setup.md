# 03: Importar a planilha do playbook do setup

**What to build:** o Administrador envia o `.xlsx` no modelo do setup e vê a prévia seção por seção antes de gravar; as abas conhecidas viram seções, as desconhecidas aparecem como "não importadas", e a aba Base de Pesquisa vai para a importação por CSV de Contas-alvo, em Descoberta.

**Blocked by:** 01: Seções do Playbook no banco; 02: Tela do Playbook.

**Status:** closed (a importação estruturada das tabelas e do Mercado fica para um ticket novo, ver Comments de 2026-10-07)

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

## Comments

- Feito na PR https://github.com/Kauedz/Althius/pull/91

- 2026-10-07 (reconciliação contra a `main` 59e53a6): os quatro critérios estão cumpridos.
  - Prévia antes de gravar: `src/paginas/configuracoes/importar-playbook.tsx:42-82`; testes "mostra a prévia antes de gravar e não grava nada até confirmar", "confirmar grava uma versão nova de cada seção escolhida", "diz que não conseguiu ler um arquivo que não é a planilha, sem gravar".
  - Aba desconhecida listada: `src/fonte/playbook-planilha.ts:87-99`, `importar-playbook.tsx:186-198`; teste "separa a Base de Pesquisa e lista as abas desconhecidas, vazias ou repetidas, sem descartar nenhuma em silêncio".
  - Base de Pesquisa para Contas-alvo pelo fluxo existente, em Descoberta: `playbook-planilha.ts:81-85,109-116`, `importar-playbook.tsx:84-91,165-183` (baixa o CSV e liga para `/contas/importar`); Descoberta é o estágio padrão (`20260930140000_estagio_de_prospeccao.sql:79,203`); testes "lista a aba desconhecida e leva a Base de Pesquisa para o CSV de Contas-alvo" e "gera o CSV da Base de Pesquisa com aspas e vírgulas escapadas". São dois passos à mão, mas pelo fluxo existente.
  - Planilha criada no teste, sem dado pessoal: `src/fonte/ler-xlsx.test.ts:9-27`; teste "lê todas as abas de uma planilha criada no teste, sem dado pessoal". Biblioteca `read-excel-file` ^9.3.10.
  - Testes rodados: `npx vitest run` em `ler-xlsx`, `playbook-planilha` e `configuracoes/importar-playbook` → verdes (dentro de 73 passed).
  - A limitação que a auditoria apontou é real e não viola critério escrito: toda aba vira só `texto` (`playbook-planilha.ts:68-73`, gravação com `linhas: []` em `importar-playbook.tsx:70`) e nenhuma aba vai para Mercado (`playbook-planilha.ts:24-40`). Efeitos: a Cadência importada nunca vira modelo de Sequência (`src/paginas/nova-sequencia.tsx:73` lê `linhas`), e o SLA importado não dá os critérios de passagem do Kanban.
  - Ticket novo a abrir (ready-for-agent): importação estruturada. As abas com tabela viram `linhas` nas colunas de `src/fonte/regras-playbook.ts` (Personas, Processo de compra, Dor e percepção, Pipeline, SLA e metas, Cadência, Templates, Objeções, Mercado), e TAM/SAM/SOM e a matriz de complexidade vão para Mercado. Precisa dos nomes reais das abas e dos cabeçalhos do modelo, sem dado de cliente.
  - O passo 1 do Nan não se aplica (a leitura é no navegador; não existe `playbook-import`). O passo 2 continua: importar a planilha real e conferir a prévia.
