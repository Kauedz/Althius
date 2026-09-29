# 04: Importar o que o cliente já tem (Apollo, Lusha, Clay)

**What to build:** quando o cliente conecta o Apollo, o Lusha ou o Clay dele, a Althius importa e sincroniza os contatos que ele já tem, sem crédito de dado; o enriquecimento novo continua pela cascata da Althius (ADR-0019).

**Blocked by:** `conexoes-funcionais` 10, 11 e 12 (Acesso a Apollo, Clay e Lusha).

**Status:** needs-info (depende das Conexões)

## Pode mexer

- A sincronização de leitura, no padrão da do HubSpot (ADR-0016).

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Importar não debita crédito de dado; classificar Fit ou Persona debita como Execução.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Se o ticket criou migration: `git checkout main`, `git pull`, `npx supabase db push` (na raiz do repositório).
2. Publicar a Edge Function de sincronização criada (`npx supabase functions deploy <nome> --project-ref ycbdilsmydvzezhlymty`).
3. Conectar no navegador uma conta de teste do Apollo, do Lusha ou do Clay para a conferência real.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
