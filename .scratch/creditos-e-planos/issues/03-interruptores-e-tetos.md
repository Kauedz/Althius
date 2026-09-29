# 03: Interruptores "confirmar ou automático" e tetos

**What to build:** uma página única nas Configurações mostra, por tipo de ação (varredura, enriquecimento, Agentes) e por Agente e Integração, o interruptor confirmar ou automático e o teto mensal de cada automático; nada automático roda sem teto.

**Blocked by:** 02: Saldo e lançamentos de crédito.

**Status:** ready-for-agent

## Pode mexer

- Migration aditiva com as configurações e as funções de leitura e gravação (só Administrador grava).
- A página nova nas Configurações e a Fonte dela.

## Não mexa

- Nas funções de Permissão dos Agentes (`save_agent_settings`), a não ser para chamá-las.
- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Sem teto aprovado, o automático não roda e a tela diz por quê.
- [ ] Chegou no teto: o automático pausa e gera um Aviso do Workspace.
- [ ] As Permissões Ler/Propor/Executar dos Agentes aparecem na mesma página, sem duplicar o dado (lidas das funções do CRM-13).

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Aplicar a migration: `git checkout main`, `git pull`, `npx supabase db push` (na raiz do repositório).

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
