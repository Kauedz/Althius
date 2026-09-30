# 01: Seções do Playbook no banco

**What to build:** as seções fixas do Playbook do Workspace ficam numa tabela privada, com versão, autor e data; o Administrador grava e todo participante ativo lê, por funções `security definer`. ICP e Personas da Memória do Workspace passam a ser as seções ICP e Personas.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

## Pode mexer

- Uma migration nova (`<timestamp>_playbook_do_workspace.sql`) com a tabela, a validação do `jsonb` por seção e as funções `list_playbook_sections`, `get_playbook_section`, `save_playbook_section`, `restore_playbook_version`.
- Uma função só para `service_role`, `playbook_for_specialty(p_workspace_id, p_specialty)`, que devolve Empresa mais as seções da Especialidade.
- pgTAP novo `supabase/tests/playbook_do_workspace.sql`.

## Não mexa

- Nas tabelas dos Agentes (`private.agents*`) e das Conversas (`private.agent_*runs*`).
- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [x] Seções fixas na ordem da spec; seção desconhecida é recusada (22023).
- [x] Só Administrador ativo grava; todo participante ativo lê; outro Workspace nunca lê (pgTAP).
- [x] Cada gravação cria uma versão; restaurar cria uma versão nova igual à antiga.
- [x] `playbook_for_specialty` devolve Empresa + as seções mapeadas (Scopus: ICP, Mercado; Ethos: Personas, Processo de compra, Dor e percepção, Objeções; Rhetor: Cadência, Scripts, Templates, Frameworks, Objeções; Oraculum: Empresa, ICP).
- [x] Tabela com RLS explícito e sem acesso direto dos papéis do app.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Aplicar a migration: `git checkout main`, `git pull`, `npx supabase db push` (na raiz do repositório).

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
