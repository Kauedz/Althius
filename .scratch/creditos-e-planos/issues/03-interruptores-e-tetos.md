# 03: Interruptores "confirmar ou automático" e tetos

**What to build:** uma página única nas Configurações mostra, por tipo de ação (varredura, enriquecimento, Agentes) e por Agente e Integração, o interruptor confirmar ou automático e o teto mensal de cada automático; nada automático roda sem teto.

**Blocked by:** 02: Saldo e lançamentos de crédito.

**Status:** ready-for-human (código fechado em 2026-10-08 na `ralph/frente-creditos`: a primeira geração das Propostas de resposta consulta Execuções de Agentes e o Rhetor, e os escopos sem executor ficam travados em confirmar; faltam aplicar a migration `20261009010000` e publicar o `reply-proposal-runner`, nos Passos do Nan; ver Comments de 2026-10-08)

## Pode mexer

- Migration aditiva com as configurações e as funções de leitura e gravação (só Administrador grava).
- A página nova nas Configurações e a Fonte dela.
- (2026-10-08, decisões do Renan) O `reply-proposal-runner` e a Resposta sugerida (tipo, Fonte e tela), para a primeira geração da proposta consultar o teto e a tela dizer por que ela não saiu.

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
2. (2026-10-08) Depois do merge da `ralph/frente-creditos` com o CI verde, na raiz do repositório, no PowerShell: `git checkout main; git pull; npx supabase db push`. Aplica a `20261009010000_teto_das_propostas_de_resposta.sql`, depois da `20261008233000` do ticket 01; ou pelo `execute_sql`, em bloco atômico, como em `docs/agents/migrations.md`. Ela volta para confirmar o automático já gravado nos escopos sem executor; nenhuma linha sai.
3. Só depois da migration: `npx supabase functions deploy reply-proposal-runner --project-ref ycbdilsmydvzezhlymty`. Publicado antes, o runner novo falha cada geração (a função `consume_reply_proposal_cap` ainda não existe). Entre a migration e o deploy, o runner antigo segue gerando sem teto, como hoje.
4. Saber o efeito: depois do passo 3, nenhuma Proposta de resposta sai sozinha até um Administrador ligar Execuções de Agentes **e** o Rhetor em Automático, com teto, em Configurações › Automação e tetos. Até lá, cada proposta mostra o motivo e o botão "Gerar resposta", e o clique do titular gera sem passar pelo teto.

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

- 2026-10-08 (frente créditos, `ralph/frente-creditos`):
  - Decisões do Renan nesta data:
    - **Decisão 6, escopos sem executor:** travar em confirmar. Valem para Enriquecimento, Integrações e os Agentes que não são o Rhetor. A linha mostra "Ainda não roda sozinho: cada ação pede confirmação." e não oferece Automático, e o banco recusa ligar. A Demonstração fica como está.
    - **Propostas de resposta:** parar e pedir o clique. Só a primeira geração, que é automática, consulta o teto. Execuções de Agentes **e** o Rhetor precisam liberar, e a rodada soma o crédito aos dois. A proposta barrada mostra o motivo e "Gerar resposta". O clique do titular vale como confirmação e não passa pelo teto. O teto vale mesmo com a cobrança desligada.
  - Banco (`20261009010000_teto_das_propostas_de_resposta.sql`):
    - `consume_reply_proposal_cap` e `refund_reply_proposal_cap` são só do servidor. O runner as chama antes de reservar o crédito e quando a geração falha.
    - `begin_reply_proposal_round` não mudou: o pgTAP antigo `propostas_de_resposta.sql` confere os desfechos dela.
    - A pré-checagem não gasta nada. Uma recusa sem efeito (confirmar, sem teto, pausado) vem antes da falta de espaço, e só o teto sem espaço é consultado, para pausar e avisar uma vez.
    - `list_runnable_automation_scopes` diz quem roda sozinho: varredura, Execuções de Agentes e o Rhetor, por `private.automation_scope_runs`.
    - `save_automation_setting` foi redefinida a partir da `20260930170000` e recusa Automático onde ninguém executa.
    - O automático já gravado nesses escopos volta a confirmar; nenhuma linha sai.
    - `list_automation_settings` não mudou, porque o pgTAP antigo `interruptores_e_tetos.sql` afirma que toda linha começa em `confirmar`. A Fonte junta as duas leituras.
  - Runner (`reply-proposal-runner`): barrada, a proposta falha com `automation_confirm`, `automation_no_cap` ou `automation_cap_reached`, que não são passageiros. Assim não chama o modelo nem reserva crédito. A geração que passou pelo teto e falhou devolve o que somou.
  - Frontend:
    - A Resposta sugerida mostra o motivo e "Gerar resposta" (`paradaPeloTeto`, lido do `failure_code`).
    - A página de Automação trava em Confirmar o escopo sem executor (bloqueio `sem_executor`).
    - O teste das Permissões na página já passava no código atual. Ele é a cobertura que a reconciliação pediu; a leitura por `get_agent_settings` já tinha teste em `supabase-agentes.test.ts`.
  - Vermelho:
    - pgTAP `teto_das_propostas_de_resposta.sql` 0/25: `function public.consume_reply_proposal_cap(uuid, uuid) does not exist`.
    - `deno test --allow-all --no-check supabase/functions/reply-proposal-runner/teto.test.ts`: em confirmar, o runner chamava o modelo, e a falha não devolvia o teto.
    - vitest `supabase-sequencias-propostas-teto`, `resposta-sugerida-teto`, `supabase-automacao-executor` e `automacao-executor`: 7 falhas. A Fonte não trazia o motivo, a tela não o mostrava e a página deixava ligar o Enriquecimento.
    - Na revisão: pgTAP 28/29 (um segundo Aviso de Execuções de Agentes) e 29/31 (`teto_atingido` em vez de `confirmar`).
  - Verde:
    - Os mesmos testes passam; pgTAP próprio 31/31.
    - Suíte completa: pgTAP do zero (`scripts/pgtap-local.sh`, Postgres 16 local) com 59 arquivos e 2577/2577 asserções; `deno test --allow-all supabase/functions` 727/727; `deno check supabase/functions/*/index.ts` limpo.
    - Frontend: `npx vitest run --maxWorkers=2` com 112 arquivos e 1082/1082; `tsc -b` limpo; `npm run lint` com saída 0 (só avisos antigos).
  - Revisão (padrões e spec, depois segunda leitura): sem problema aberto. Corrigidos:
    - a ordem das recusas e a pré-checagem com o valor da rodada;
    - a trava do trabalho (`for update`);
    - o automático gravado em escopo sem executor;
    - o texto do motivo, que cita Execuções de Agentes ou o Rhetor;
    - o `index.ts`, que agora obriga o teto;
    - o tipo `BloqueioDoTeto`;
    - a quebra do JSDoc e o vocabulário "o titular".
  - Ficam como estão, de propósito:
    - o preço da rodada repetido em `private.reply_proposal_round_credits`: o `reserve_credits` não expõe o preço e é usado por outras frentes;
    - a Fonte que segue como antes quando `list_runnable_automation_scopes` falha: precisa disso o teste antigo, cujo dublê não tem a função, e a ordem do deploy;
    - o Aviso que pode sair de novo quando uma rodada chega exatamente no teto, falha e é devolvida, como na varredura;
    - o gasto que não volta se a função cair depois de somar e o trabalho vencer: é conservador.
  - Para o Nan:
    - O custo antes do clique ("quero ver o custo antes de rodar uma ação paga no modo confirmar", história 4 da spec) não está nos critérios deste ticket, e "Gerar resposta" não mostra o custo.
    - Quem ligar o automático do Enriquecimento (enriquecimento-em-cascata 02) redefine `private.automation_scope_runs` e chama `consume_automation_cap(workspace, 'acao:enriquecimento', créditos)`.
  - Conferência visual: Chrome headless a 1400 px, nos temas escuro e claro. O andaime ligava a Fonte real de Automação a um cliente falso que responde como o banco depois da migration; ele foi apagado antes do commit. Prints:
    - [Automação, escuro](prints/03-automacao-escopos-sem-executor-escuro.jpg) e [claro](prints/03-automacao-escopos-sem-executor-claro.jpg): Enriquecimento, Integrações e os outros Agentes travados em Confirmar; varredura, Execuções de Agentes e o Rhetor com o interruptor.
    - [Proposta barrada, escuro](prints/03-proposta-barrada-pelo-teto-escuro.jpg) e [claro](prints/03-proposta-barrada-pelo-teto-claro.jpg): confirmar e teto atingido com "Gerar resposta"; a falha comum segue com "Gerar de novo".
    - A 360 px a barra lateral fixa corta o conteúdo da página inteira. Isso vem da casca, não deste ticket.
