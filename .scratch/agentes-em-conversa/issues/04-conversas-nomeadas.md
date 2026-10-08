# 04: Conversas nomeadas com vários Agentes

**What to build:** o participante cria Conversas com nome (ex.: "ICP da Althius", "Campanha Q4"), vê a lista, reabre e continua; qualquer Agente pode entrar por @menção ou pela Coordenação.

**Blocked by:** None (can start immediately).

**Status:** closed

## Pode mexer

- Uma migration aditiva que acrescenta `title` a `private.agent_conversations` e as funções de renomear e listar.
- `projeto-althius-frontend/src/fonte/supabase-conversas.ts`, `conversa/contexto.tsx` e as páginas de Conversa.

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [x] Criar, renomear, listar e reabrir Conversas; a Conversa continua privada de quem a começou.
- [x] A retomada depois de recarregar continua funcionando (testes existentes verdes).

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Aplicar a migration: `git checkout main`, `git pull`, `npx supabase db push` (na raiz do repositório).

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- Feito na PR https://github.com/Kauedz/Althius/pull/95

- 2026-10-07 (reconciliação contra a `main` 59e53a6):
  - Criar, renomear, listar e reabrir; a Conversa é de quem a começou: `start_agent_run` sem `p_conversation_id` cria a Conversa (`20260929180000_conversas_dos_agentes.sql:198-206`); `title` em `20260930113000_conversas_nomeadas.sql:5-6`, listar em `:9-38` (filtra `owner_id` em `:33`), renomear em `:41-62` (confere o dono em `:52-53`); tela em `src/fonte/supabase-conversas.ts:264-292`, `src/paginas/conversas-salvas.tsx:18-70`, `src/paginas/nome-da-conversa.tsx`. pgTAP "a Ana lista só as duas Conversas dela", "o Bruno não renomeia a Conversa da Ana", "a Carla, do Sul, não lista nada do Norte"; vitest "a página de Agentes lista as Conversas anteriores, com o nome ou o primeiro pedido", "reabrir uma Conversa mostra os pedidos dela, e o próximo pedido a continua", "renomear guarda o nome, mostra na Conversa e na lista".
  - A retomada depois de recarregar: `retomarConversas` em `supabase-conversas.ts:242-262`; `supabase-conversas.test.ts` não muda desde 07ed97e; teste "depois de recarregar, traz as Conversas salvas e continua o pedido que ainda roda de onde parou".
  - Testes rodados: `npx vitest run src/fonte/supabase-conversas-nomeadas.test.ts src/fonte/supabase-conversas.test.ts src/paginas/conversas-nomeadas.test.tsx` → 3 + 8 + 4 passed; pgTAP `conversas_nomeadas.sql` (16) e `conversas_dos_agentes.sql` (61) ok no CI 37707955273.
  - O que a auditoria apontou ("nome no `start_agent_run` e lista por Agente") não está nos critérios escritos: hoje o nome vem por renomear, e a lista mostra só as Conversas coordenadas (`supabase-conversas.ts:269`). Se o Nan quiser, é ticket novo.
