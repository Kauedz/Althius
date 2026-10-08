# 03: Interruptores "confirmar ou automático" e tetos

**What to build:** uma página única nas Configurações mostra, por tipo de ação (varredura, enriquecimento, Agentes) e por Agente e Integração, o interruptor confirmar ou automático e o teto mensal de cada automático; nada automático roda sem teto.

**Blocked by:** 02: Saldo e lançamentos de crédito.

**Status:** ready-for-agent (só a varredura consulta o teto; as propostas de resposta rodam sozinhas sem teto; ver Comments de 2026-10-07)

## Pode mexer

- Migration aditiva com as configurações e as funções de leitura e gravação (só Administrador grava).
- A página nova nas Configurações e a Fonte dela.

## Não mexa

- Nas funções de Permissão dos Agentes (`save_agent_settings`), a não ser para chamá-las.
- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [x] Sem teto aprovado, o automático não roda e a tela diz por quê.
- [x] Chegou no teto: o automático pausa e gera um Aviso do Workspace.
- [x] As Permissões Ler/Propor/Executar dos Agentes aparecem na mesma página, sem duplicar o dado (lidas das funções do CRM-13).

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Aplicar a migration: `git checkout main`, `git pull`, `npx supabase db push` (na raiz do repositório).

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- Escopos: `acao:varredura`, `acao:enriquecimento`, `acao:agentes`, `agente:<id>`, `integracao:<id>`. Modo `confirmar` (padrão) ou `automatico`, este só com teto mensal aprovado.
- Para o servidor: `consume_automation_cap(workspace, escopo, créditos)` devolve `ok` (e soma ao gasto), ou `confirmar`, `sem_teto`, `teto_atingido`. Quem roda uma ação automática chama antes; o `sinais-reais` 02 e o Motor dos Agentes chamam ao usar o automático.
- Chegou no teto: o escopo pausa até o mês virar ou o teto subir acima do gasto, e um Aviso do Workspace (`private.workspace_notices`, lido pelo Administrador em `list_workspace_notices`) sai uma vez. A entrega desse Aviso como notificação do navegador fica para quando a fonte real de Avisos existir.
- As Permissões Ler/Propor/Executar dos Agentes aparecem só para leitura na página, lidas da configuração do Agente.
- Tela: Configurações › Automação e tetos.

- 2026-10-07 (reconciliação contra a `main` 59e53a6):
  - Parcial (sem teto, o automático não roda): o banco recusa automático sem teto (`20260930170000_interruptores_e_tetos.sql:142`) e `consume_automation_cap` devolve `sem_teto` (`:161-208`); a tela diz o motivo (`src/paginas/configuracoes/secao-automacao.tsx:119-122`). Testes: pgTAP "automático sem teto é recusado" (`interruptores_e_tetos.sql` ok no CI 37707955273); vitest "automático sem teto é recusado na tela, com o motivo"; Deno "automático em confirmar, sem teto ou no teto: não varre, não cobra e diz por quê". Mas só `acao:varredura` é consultado (`begin_account_scan` em `20260930180000:698`, `begin_rescan_scan` e `enqueue_monthly_rescans` em `20260930200000:350,419-425`). `acao:enriquecimento`, `acao:agentes`, `agente:<id>` e `integracao:<id>` são gravados e ninguém os lê. As propostas de resposta são uma ação automática de Agente e reservam `agent_round` sem consultar teto (`20261001180000_propostas_de_resposta.sql:912-960`).
  - Cumprido no banco (teto atingido pausa e gera Aviso): `:187-205`; asserções "depois de passar, o escopo fica pausado", "e um Aviso do Workspace sai uma vez" e "o Administrador vê o Aviso". A tela de Avisos o próprio ticket adiou.
  - Parcial (Permissões na mesma página): lidas de `get_agent_settings` (`secao-automacao.tsx:35-41,124-128`), sem teste que confira a exibição.
  - Testes rodados: `npx vitest run src/fonte/supabase-automacao.test.ts src/paginas/configuracoes/automacao.test.tsx` (dentro de 16 passed, 0 failed).
  - Falta (agente): (1) as propostas de resposta consultam `acao:agentes` e `agente:<id do Rhetor>` antes de reservar, com pgTAP; (2) vitest das Permissões Ler/Propor/Executar na página. Antes: decisão do Nan para os escopos sem executor (Enriquecimento, Integrações, os outros Agentes): a tela diz que ainda não há automático, ou o interruptor fica desligado. Hoje a página aceita ligar e nada acontece.
