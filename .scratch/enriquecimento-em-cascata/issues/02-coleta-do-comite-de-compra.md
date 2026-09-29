# 02: Coleta do comitê de compra

**What to build:** quando uma Conta vira Fit, o Ethos busca os 3 perfis das Personas do Playbook (Decisor, Influenciador, Campeão): sozinho quando o interruptor de enriquecimento está em automático, e só sugere quando está em confirmar.

**Blocked by:** 01: Fornecedores da cascata; `playbook-do-workspace` 01; `creditos-e-planos` 03.

**Status:** ready-for-agent

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
