# Inventário dos consumidores do Playbook e do mini-ICP (ticket 07)

Auditoria feita em 07/11/2026 na branch `contexto-da-empresa-03-onboarding`, depois dos tickets 01 a 06. Busca por
`playbook`, `get_playbook_section`, `list_playbook_sections`, `save_playbook_section`, `propose_playbook_revision`,
`agent_run_playbook`, `o_que_vende`, `mini_icp`, `por_que_compram`, `oQueVende`, `miniIcp` e `memoriaDoWorkspace` no
frontend, nas Edge Functions, no e2e e na **última definição** de cada função do banco (`supabase/migrations`).

Legenda: **migrado** (passa a ler o Contexto da empresa), **retirado** (sai do produto), **registro** (fica só para ler o
histórico), **sem uso** (fica no banco, ninguém chama), **já migrado** (tickets 03–06).

## Banco (última definição de cada função)

| Consumidor | O que lia | Destino |
| --- | --- | --- |
| `reply_proposal_context` (rascunho de resposta do Rhetor) | seções `empresa`, `icp`, `cadencia`, `scripts`, `templates`, `frameworks`, `objecoes` | **migrado** em `20261221050000_retirada_do_playbook.sql`: devolve `contexto` (três textos + versão) |
| `compute_agent_prompt_suggestions` | seções do Playbook | já migrado (ticket 06) |
| `get_discovered_account_fit_explanation` | `day0_companies.o_que_vende` | já migrado (ticket 05) |
| `agent_run_playbook`, `agent_propose_playbook_revision` | Playbook | sem uso desde o ticket 06 |
| `get_playbook_section`, `list_playbook_sections`, `save_playbook_section`, `restore_playbook_version`, `propose_playbook_revision`, `playbook_for_specialty` e as auxiliares privadas | Playbook | sem uso pela tela, Edge Functions e Canal; continuam com `execute` para `authenticated` (decisão do usuário em 07/11/2026: não fechar agora) |
| `decide_approval` / `list_approvals` / `cancel_approval` (categoria `revisao`) | revisões do Playbook | registro: a tela mostra, não decide; a pendente vence em 7 dias |
| `get_my_day0` / `save_my_day0` (ação `produto`) | mini-ICP | sem uso pela tela desde o ticket 03 |
| `create_company_workspace` (criação legada, só `service_role`) | copia o mini-ICP do Workspace pessoal para o da empresa | sem uso como fonte: só copia a linha; nada lê o mini-ICP depois. Fica como está (pgTAP antigo a exercita) |

## Edge Functions

| Consumidor | O que lia | Destino |
| --- | --- | --- |
| `reply-proposal-runner` | `playbook` de `reply_proposal_context` | **migrado**: prompt com os três textos, versão e corte em 24 mil caracteres |
| `signal-plan` | seção `icp` + mini-ICP do Day0 | **migrado**: `get_company_context` com a sessão de quem pede |
| `account-discovery`, ação `criteria` | seção `icp` (`criteriosDoIcp`) | **retirado** (devolve "Ação desconhecida."); a busca sai de `prepare` (ticket 04) |
| `_shared/canal/ferramentas-plataforma.ts` (Canal WhatsApp) | `listar_secoes_do_playbook`, `consultar_secao_do_playbook` | **migrado**: `consultar_contexto_da_empresa` → `get_company_context` |
| `icp-site-read` (leitura do site para o mini-ICP) | — (gerava o mini-ICP) | **retirado**: nada a chamava desde o ticket 03; código e entrada em `config.toml` removidos |
| `_shared/orquestracao.ts` (Agentes) | Playbook só para a Proposta de resposta | já migrado (ticket 06); restos `SecaoDoPlaybookNaExecucao`/`corpoDaSecao` removidos |
| `_hermes-worker`, `agent-conversation`, ferramentas dos Agentes | — | já migrado (ticket 06) |

## Frontend

| Consumidor | O que lia | Destino |
| --- | --- | --- |
| Configurações → Playbook (`secao-playbook`, `importar-playbook`, planilha `.xlsx`, `supabase-playbook`, `simulada-playbook`, `FonteDoPlaybook`) | Playbook | **retirado**; `/configuracoes/playbook[/*]` leva ao Contexto da empresa; dependência `read-excel-file` removida |
| Configurações → Memória do Workspace (`secao-memoria`) | seções `icp`/`personas` do Playbook (operacional) e Memória simulada (Demonstração) | **retirado**; `/configuracoes/memoria[/*]` leva ao Contexto da empresa |
| Kanban: critérios de passagem e "Pedir ao Ethos" (`criterios-de-passagem`, `pedir-ao-ethos`) | seção `sla_e_metas` | **retirado** (decisão do usuário em 07/11/2026); mover de Estágio não muda |
| Aprovações e passo da Conversa (`cartao-de-revisao-do-playbook`) | seção vigente do Playbook ao lado da proposta | **registro**: sem Aprovar/Recusar, sem ler o Playbook, fora da contagem de pendentes, com link ao Contexto da empresa |
| Mercado na Demonstração (`criteriosDaBusca`/`buscarContas`) | ICP fixo do caminho antigo | **migrado**: `prepararBusca`/`buscarPorPerfis` com os perfis do contexto de exemplo; o caminho antigo saiu da tela e da fonte operacional; a proteção do visitante passou para `buscarPorPerfis` |
| Catálogo de Sinais: "Para o seu nicho", pedido de Sinal | Segmentos do ICP da Memória | **migrado**: Perfil de cliente ideal do Contexto da empresa; o pedido não pré-preenche mais as empresas |
| Editor de Monitoramento e de cascata: "Público recomendado" | ICP da Memória | **migrado**: resumo do Perfil de cliente ideal e link ao Contexto da empresa |
| Página do Agente → Memória: "Contexto do Workspace" | documentos da Memória | **migrado**: os três textos vigentes do Contexto da empresa |
| Habilidades do Agente (uso do documento vigente) e Persona na tabela de Contatos (definição em popover) | documentos da Memória (só Demonstração) | **retirado** o trecho que lia a Memória |
| Ajuda → Contexto | texto sobre o Playbook | reescrita para o Contexto da empresa |
| Onboarding / Day0 | mini-ICP | já migrado (ticket 03) |
| Criação de Sequências | Cadência do Playbook | já migrado (ticket 06) |

## e2e (smoke de produção)

`global-setup` e `02-day0-icp` gravam e conferem o ICP de teste no Contexto da empresa (`save_company_context`), não no
Playbook; `03-para-o-seu-nicho` e `06-signal-plan` acompanham o novo texto. A suíte roda contra a produção e não foi
executada nesta entrega.

## Resultado da auditoria

Nenhuma operação ativa lê o Playbook ou o mini-ICP como fonte ou como reserva. O que continua no banco (tabelas, versões,
revisões, mini-ICP gravado, RPCs antigas) fica sem uso ou como registro, sem nada apagado nem reclassificado.

Fora do escopo, anotado para decisão à parte:

- Fechar as RPCs antigas do Playbook para `authenticated` (exige mexer em pgTAP antigo) e, depois, apagar as tabelas.
- A Memória do Workspace simulada da Demonstração (`fonte.memoriaDoWorkspace`, `solicitarRevisao`, `simulada-memoria`,
  as revisões e os avisos dela) não tem mais tela que a use; os testes de avisos do navegador a exercitam pela fonte.
  Retirá-la é uma limpeza própria, que mexe nos avisos e nas revisões da Demonstração.
- `create_company_workspace` ainda copia o mini-ICP na criação legada; sem leitor, é inofensivo.
