# 13: Persistir Agentes e permissões por integração

**What to build:** participantes administram Agentes padrão e criados, Memória, Habilidades, Rotinas e permissões na experiência existente, e reencontram a configuração salva em outra sessão.

**Blocked by:** 03: Convidar e gerenciar participantes; 08: Persistir perfil e preferências.

**Status:** ready-for-human

- [x] Catálogo de Especialidades permanece fixo; Agente criado tem Especialidade existente e configuração inicial derivada do padrão.
- [x] Agentes, Memória, Habilidades, Rotinas e personalização são isolados por Workspace e persistem.
- [x] Administrador e Membro têm ações coerentes com as permissões atuais do produto.
- [x] Permissão por integração persiste como Ler, Propor ou Executar e a UI mostra seu estado real.
- [x] Exclusão de Agente criado respeita referências e histórico; Agente padrão não pode ser excluído.
- [x] Integrações ainda não escolhidas ou configuradas são indisponíveis/demonstrativas e não aceitam ações simuladas como reais.

## Comments

**Implementação (29/09/2026).** Migration `20260929130000_agentes_e_permissoes.sql` (só local; nada aplicado no remoto) e teste `supabase/tests/agentes_e_permissoes.sql` (112 asserções). Adapter `supabase-agentes.ts` no Workspace operacional, ligado em `composicao.ts`, e as telas de Agentes ligadas a ele.

- **Banco.** Tabelas privadas com RLS e sem privilégio para os papéis do app; leitura e escrita só por funções `security definer` com `search_path` vazio, `revoke`/`grant` explícitos. Todo Workspace nasce (gatilho) com os quatro Agentes padrão, com as Permissões padrão da ADR-0002 (Ler; Propor onde a Integração escreve ou gasta); os Workspaces existentes recebem o backfill na própria migration. O catálogo de Especialidades é uma tabela só de leitura. O Agente padrão não sai nem por escrita direta (gatilho) e nenhum Agente é renomeado. Um Agente de outro Workspace responde como inexistente (`agent not found`), sem revelar o identificador.
- **Exclusão de Agente criado.** Apaga a configuração dele (Personalização, base de conhecimento, Permissões, Habilidades, Rotinas, Memória). Uma referência de outro módulo que não acompanha o Agente (chave estrangeira sem cascata) recusa a exclusão com `agent has references`, sem apagar nada; o adapter traduz isso. Criação, exclusão e cada troca de Permissão ficam em `private.agent_events`, sem chave para o Agente, então o histórico sobrevive a ele. **Para o CRM-14/15:** Execuções, Atividade e Aprovações do Agente devem referenciar `private.agents(id)` com `on delete cascade` (CONTEXT: as Aprovações e a Atividade saem com o Agente criado); com outra escolha a exclusão será recusada.
- **Decisão (Administrador x Membro).** As specs não separam quem configura Agentes: a spec do CRM diz "participante", a de Configurações diz que o Membro consulta o que é compartilhado e não administra o Workspace, e a Permissão por Integração é decisão de gestor (ADR-0002, estória 54). Escolhi o mais próximo dos dois textos e mais seguro: todo participante consulta; só Administrador cria e exclui Agentes e altera Personalização, Permissões, Memória, Habilidades e Rotinas. Se um Membro pudesse pôr Executar numa Integração, contornaria a Aprovação. O banco valida o papel na operação; a tela só esconde os controles do Membro e explica. Vale a mesma tela na Demonstração (a sessão dela é Administradora). **Precisa de confirmação do usuário.**
- **Decisão (Habilidades copiadas).** O Agente criado copia as Habilidades do padrão com os usos zerados: quem as usou foi o padrão (a demonstração copia os usos, o que não é número honesto no Workspace operacional).
- **Decisão (Integrações).** O catálogo (`catalogo-de-conexoes.ts` no front, `private.integration_catalog` no banco, mesmos identificadores) é fixo e a Permissão é do Agente. Nenhuma Integração nem Canal está conectado no Workspace operacional: a tela mostra "não conectada", os interruptores de Canal ficam desativados e `conectar` continua recusando. `/conexoes` e as funções de conexão não foram tocados.
- **Front: separação do módulo `agentes`.** `agentes` (configuração, real) e `conversas` (Conversas e Coordenação, indisponível até o CRM-14). No Workspace operacional: a grade, a página do Agente, Personalização, Permissões, Canais, Memória, Habilidades e Rotinas são reais; o composer, as sugestões e a Conversa dizem que não estão disponíveis, sem resposta simulada; as Rotinas avisam que ficam salvas mas ainda não rodam; a Atividade diz que o Agente não executou nada. Estado sempre "ocioso" e 0 execuções (exato). A Memória do Workspace (CRM-09) passou a dizer "chegam junto com a execução dos Agentes".
- **Fora deste ticket.** Nenhuma Execução, LLM ou motor (CRM-14, CRM-25). Memória e Habilidades só são criadas pelo Agente quando executar; hoje só se consultam, corrigem e apagam (Memória) ou se ligam e desligam (Habilidades). Documento da base de conhecimento guarda só o nome: não há envio de arquivo.
- **Testes.** pgTAP: 112 asserções deste ticket, do zero, mais o `workspace_da_empresa` ajustado (o Workspace novo nasce com os Agentes padrão). Front: `supabase-agentes.test.ts`, `paginas/agentes-reais.test.tsx` (banco em memória em `test/agentes-no-banco.ts`) e `raiz.test.tsx` atualizado.
- **Pendente (por isso `ready-for-human`).** Aplicar a migration no remoto (pede autorização, `docs/agents/migrations.md`) e a conferência visual do Workspace operacional, que depende dela.
