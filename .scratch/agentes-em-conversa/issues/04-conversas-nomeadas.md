# 04: Conversas nomeadas com vários Agentes

**What to build:** o participante cria Conversas com nome (ex.: "ICP da Althius", "Campanha Q4"), vê a lista, reabre e continua; qualquer Agente pode entrar por @menção ou pela Coordenação.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

## Pode mexer

- Uma migration aditiva que acrescenta `title` a `private.agent_conversations` e as funções de renomear e listar.
- `projeto-althius-frontend/src/fonte/supabase-conversas.ts`, `conversa/contexto.tsx` e as páginas de Conversa.

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Criar, renomear, listar e reabrir Conversas; a Conversa continua privada de quem a começou.
- [ ] A retomada depois de recarregar continua funcionando (testes existentes verdes).

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Aplicar a migration: `git checkout main`, `git pull`, `npx supabase db push` (na raiz do repositório).

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
