# 09: Revisar e propagar ICP e Personas do Workspace

**What to build:** participantes solicitam propostas de ICP e Personas e Administradores revisam, aprovam ou recusam; a última versão aprovada atualiza as referências compartilhadas.

**Blocked by:** 03: Convidar e gerenciar participantes; 08: Persistir perfil e preferências; 13: Persistir Agentes e permissões por integração; 14: Executar Conversas e Coordenação com estado recuperável.

**Status:** closed

- [x] ICP e Personas são persistidos como configuração compartilhada do Workspace, não como cópias por participante. (São as seções `icp` e `personas` do Playbook, uma versão por Workspace. pgTAP `revisao_do_playbook_por_aprovacao.sql`, bloco 9: o Membro lê a mesma versão aprovada, e o outro Workspace continua vazio.)
- [x] Propostas, decisão administrativa e auditoria têm estado e autor persistidos. (`private.approvals` com `category = 'revisao'`, seção, versão de partida, versão gravada, Agente, Execução, quem pediu, quem decidiu e onde; `private.approval_events` com cada estado e o autor. pgTAP, blocos 2, 8, 10 e 13.)
- [x] Somente Administrador aprova ou recusa. (`decide_approval` recusa Membro, ex-participante, Administrador de outro Workspace e anônimo; pgTAP, blocos 1 e 7. Na tela, Aprovar e Recusar só para o Administrador: `revisao-do-playbook-real.test.tsx`.)
- [x] A aprovação substitui a versão atual e propaga às dependências existentes conforme a spec de Configurações. (Aprovar grava a versão nova da seção na mesma transação; `playbook_for_specialty` passa a devolvê-la ao Scopus e ao Oraculum, e as telas do Playbook e da Memória leem a mesma. pgTAP, blocos 8 e 9. Uma base desatualizada não sobrescreve: blocos 12 a 14.)
- [x] A interface atual mostra versão aprovada, proposta pendente, recusa e estado vazio sem roteiros apresentados como trabalho real. (`secao-memoria.tsx` no Workspace operacional, `cartao-de-revisao-do-playbook.tsx`, `secao-playbook.tsx`; `revisao-do-playbook-real.test.tsx` e os prints abaixo.)

## Comments

**2026-09-29, decisão do usuário: esperar os Agentes.** A spec de Configurações diz que a revisão do ICP é proposta pelo Scopus e a das Personas pelo Ethos, e que não há edição direta que dispense esses Agentes e a Aprovação. Uma primeira implementação deixava o próprio participante escrever a proposta, porque os Agentes ainda não rodam no Workspace operacional. O usuário escolheu não seguir com essa ponte: o ticket espera a 13 e a 14.

- Enquanto isso, a Memória do Workspace no Workspace operacional mostra um aviso ("O ICP e as Personas deste Workspace chegam junto com os Agentes."), no lugar do aviso genérico de seção indisponível. Sem documento de exemplo e sem edição direta.
- O rascunho da primeira implementação ficou em `.scratch/crm-real-e-stack/rascunhos/09-icp-e-personas-proposta-direta.patch`, só como referência. Ele traz a migration `memoria_do_workspace` (documentos, revisões e eventos por Workspace, aprovação só de Administrador), 49 testes pgTAP e a tela. Quando a 13 e a 14 existirem, a proposta deve vir do Agente, e não do texto livre do participante.

**2026-10-09, a revisão sobre as seções do Playbook (Claude Code).** Com a 13, a 14, a 15 e o Playbook em produção, a proposta vem do Agente numa Conversa e vira uma Aprovação da categoria revisão, na fila de sempre (ADR-0010). Cumpre também os critérios de `agentes-em-conversa` 05. O rascunho de 29/09 não foi aplicado.

- Banco: `supabase/migrations/20261009220509_revisao_do_playbook_por_aprovacao.sql`.
  - `private.approvals` ganha `category` (`acao` ou `revisao`), `playbook_section`, `base_version`, `proposed_content` e `applied_version`. A ação continua exigindo a Integração (regressão no pgTAP, bloco 17); a revisão não tem Integração.
  - `public.agent_propose_playbook_revision`, só do servidor: confere a Execução em andamento, o Agente do Workspace, a Especialidade (só o Scopus e o Ethos, e só nas seções deles; a Empresa não), quem pediu ainda ativo e o conteúdo. Nasce sempre pendente, mesmo com Executar numa Integração. A mesma proposta na mesma Execução devolve a que já existe. Uma proposta igual à versão vigente é recusada.
  - `decide_approval` (mesma assinatura): na revisão, só o Administrador ativo; aprovar grava a versão nova com `write_playbook_version` na mesma transação (autor: quem aprovou) e guarda o número dela; recusar só registra. Se a seção mudou desde a proposta, devolve `desatualizada` e não grava nada.
  - Uma versão nova da seção (o Administrador salvou, restaurou ou aprovou outra revisão) deixa desatualizadas as revisões pendentes dela, por gatilho. Saindo de pendente (aprovada, recusada, expirada, cancelada, desatualizada), a revisão esquece o conteúdo proposto (ADR-0010).
  - `list_approvals` devolve a categoria, a seção, as versões e, só na pendente, o conteúdo. Mudou o retorno, então ela é apagada e criada de novo na mesma transação. `list_approval_events` não mudou: o histórico já traz cada estado e o autor, e a categoria vem da fila.
  - `cancel_approval`: uma revisão só se cancela enquanto pendente.
  - Excluir um Agente criado leva as revisões dele (a chave estrangeira com cascata do CRM-15, como no glossário).
  - Apagar uma Conta ou um Contato (CRM-18) cancela a revisão pendente que cita o nome, o e-mail, o telefone ou o LinkedIn dele, pela mesma regra dos fatos da Memória: `private.erase_agent_memory` foi redefinida a partir de 20260929160000 e continua devolvendo só os fatos. O Playbook vigente é o texto da empresa e não muda.
- Ferramenta `propor_mudanca_no_playbook` no catálogo compartilhado (`supabase/functions/_shared/ferramentas-dos-agentes.ts`): Scopus (ICP, Mercado) e Ethos (Personas, Processo de compra, Dor e percepção, Objeções), sem Integração. Entrada `{ secao, conteudo: { texto, linhas }, justificativa }`. O passo da Conversa diz "Scopus propôs uma nova versão do ICP — aguardando Aprovação de um Administrador", com o link da Aprovação. A ponte (`agent-conversation`) e o worker do Hermes usam o mesmo catálogo e o mesmo `bancoDasFerramentas`, então os dois recebem a ferramenta; `AGENT_TOOLS=off` e `HERMES_FERRAMENTAS=off` a desligam junto com as outras. Conta no limite de chamadas do pedido.
- Tela:
  - `fonte/supabase-aprovacoes.ts` lê a revisão como `AprovacaoDeRevisaoDoPlaybook` (contrato em `fonte/tipos.ts`); `podeDecidir` a trata como a categoria revisão. Aprovar a revisão não chama executor.
  - `/aprovacoes` e o passo da Conversa mostram `CartaoDeRevisaoDoPlaybook`: a seção, a vigente ao lado da proposta (linha nova marcada, linha que sai riscada), Aprovar e Recusar só para o Administrador, o aviso para o Membro e os estados aprovada, recusada, expirada, cancelada e desatualizada.
  - A Memória do Workspace operacional deixou o aviso genérico: abas ICP e Personas com a versão aprovada do Playbook, "Proposta pendente do Scopus", a última recusa e o estado vazio ("Nenhuma versão aprovada ainda. Peça ao Ethos numa Conversa."). Nada da Demonstração.
  - O Playbook marca no menu e na seção aberta a proposta pendente, e avisa o Administrador que salvar agora a deixa desatualizada.
  - A Demonstração não mudou.
- Documentação: atualização na ADR-0010 e no glossário (Revisão da Memória do Workspace).
- Testes:
  - pgTAP `supabase/tests/revisao_do_playbook_por_aprovacao.sql`: 57/57. pgTAP do zero (Postgres 16 local, todas as migrations desta branch com a `main` de 09/10 à noite): os 74 arquivos de `supabase/tests` passam.
  - Deno: `_shared/ferramentas-dos-agentes-playbook.test.ts` (10), `agent-conversation/runner-revisao-do-playbook.test.ts` (1), `_hermes-worker/worker-revisao-do-playbook.test.ts` (2). `deno check supabase/functions/*/index.ts` e `deno test supabase/functions` inteiros: 896 passaram.
  - Vitest: `src/fonte/supabase-aprovacoes-revisao.test.ts` (5) e `src/paginas/revisao-do-playbook-real.test.tsx` (9). Os 14 arquivos vizinhos (fila, passo da Conversa, Memória e Personas da Demonstração, Playbook, avisos, Fontes) passam sem mudança: 95 testes. `tsc -b` limpo; `oxlint` sem erro e sem aviso nos arquivos tocados. A suíte inteira roda no CI do PR.
- Conferência visual (Supabase falso, Chrome headless a 1400×900, sem erro no console):
  - [fila do Administrador](prints/09-fila-administrador.jpg): ICP e Personas pendentes, a vigente ao lado da proposta
  - [fila do Membro](prints/09-fila-membro.jpg): vê, não decide
  - [revisão desatualizada](prints/09-fila-desatualizada.jpg)
  - [passo da Conversa com o Scopus](prints/09-conversa-proposta.jpg)
  - [Memória: ICP com proposta pendente](prints/09-memoria-icp-pendente.jpg)
  - [Memória: ICP depois de uma recusa](prints/09-memoria-icp-recusada.jpg)
  - [Memória: Personas sem versão](prints/09-memoria-personas-vazia.jpg)
  - [Playbook com a proposta marcada](prints/09-playbook-indicador.jpg)
- Achado fora deste ticket, sem mudança: as sugestões da Conversa do Scopus citam a OpenAI ("Pontue a aderência da OpenAI ao nosso ICP") também no Workspace operacional, como o CRM-15 já tinha visto no Rhetor.

## Passos do Renan

**A IA que executar este ticket avisa o Renan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Renan.**

1. Depois do merge, na raiz do repositório:
   `git checkout main; git pull`
2. Aplicar a migration `supabase/migrations/20261009220509_revisao_do_playbook_por_aprovacao.sql`:
   `npx supabase db push`
   Ela apaga e cria de novo a função `public.list_approvals` (muda as colunas que devolve) e troca a regra de estados de `private.approvals` para aceitar `desatualizada`. Nenhum dado é apagado. Como pede o AGENTS.md, confirme antes de rodar.
3. Publicar a ponte dos Agentes:
   `npx supabase functions deploy agent-conversation --project-ref ycbdilsmydvzezhlymty`
4. Na VPS, atualizar e reiniciar o worker do Hermes: `git pull` na pasta do repositório e o comando de `supabase/functions/_hermes-worker/README.md` (fechar o worker com Ctrl+C e rodar de novo).
5. Publicar o frontend, logo depois dos passos 2 a 4 (uma revisão criada antes dele aparece na fila antiga como ação sem Integração).
6. Conferência real:
   - Numa Conversa, pedir ao Scopus para ajustar o ICP. O passo mostra "Scopus propôs uma nova versão do ICP — aguardando Aprovação de um Administrador", e a Aprovação aparece no passo e em `/aprovacoes`.
   - Como Membro, a Aprovação aparece sem Aprovar e Recusar.
   - Como Administrador, aprovar. Configurações → Playbook → ICP e Configurações → Memória do Workspace → ICP mostram a versão nova.
   - Repetir com o Ethos nas Personas, agora recusando: o Playbook não muda, e a Memória diz quem recusou.

## Decisões a confirmar

- (2026-10-09) Além do ICP e das Personas, o Scopus propõe o Mercado e o Ethos o Processo de compra, a Dor e percepção e as Objeções (as seções da Especialidade no Playbook). O Rhetor e o Oraculum não propõem nada por enquanto, embora o Oraculum leia o ICP.
- (2026-10-09) Várias propostas pendentes da mesma seção podem coexistir; aprovar uma deixa as outras desatualizadas, e o Agente propõe de novo a partir da versão nova.
- (2026-10-09) O Administrador continua editando o Playbook direto (Playbook, ticket 02). Salvar uma seção com proposta pendente a deixa desatualizada, e a tela avisa antes.
- (2026-10-09) A fila não mostra o pedido do participante (o texto da Conversa é de quem a começou); o Administrador lê a justificativa do Agente.
