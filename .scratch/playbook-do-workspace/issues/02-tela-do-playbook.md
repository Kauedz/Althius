# 02: Tela do Playbook nas Configurações

**What to build:** uma página "Playbook" nas Configurações do Workspace operacional mostra as seções em abas; o Administrador edita (texto e tabelas das seções estruturadas), o Membro só lê, e cada seção mostra versão, autor e o histórico.

**Blocked by:** 01: Seções do Playbook no banco.

**Status:** ready-for-agent

## Pode mexer

- Fonte nova `projeto-althius-frontend/src/fonte/supabase-playbook.ts` e a simulada da Demonstração.
- Página nova em `projeto-althius-frontend/src/paginas/` e a rota nas Configurações.
- Testes de tela com o banco em memória (padrão de `test/agentes-no-banco.ts`).

## Não mexa

- Nas páginas de Agentes e Conversas.
- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Membro não vê botão de editar; Administrador edita e grava.
- [ ] Tabelas das seções estruturadas (matriz de dores, 3 perfis, toques da cadência) editáveis linha a linha.
- [ ] Histórico com versão, autor e data; restaurar pede confirmação.
- [ ] A Demonstração mostra um Playbook de exemplo, sem backend.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Conferir a tela no navegador como Administrador e como Membro (a IA faz a conferência visual e anexa os prints; o Nan só entra se precisar de login real).

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
