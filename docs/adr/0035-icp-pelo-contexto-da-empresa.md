# ADR-0035 — O ICP vem do Contexto da empresa: o Playbook e o mini-ICP saem como fonte

Status: Aceita. Spec `contexto-da-empresa` aprovada pelo dono do produto em 05/11/2026; retirada do Playbook no ticket 07
(07/11/2026). Substitui **só a decisão 6** da [ADR-0034](0034-desfazer-sinais-first.md); as demais decisões dela
continuam valendo.

## Contexto

A decisão 6 da ADR-0034 fez da seção `icp` do Playbook do Workspace (`get_playbook_section('icp')`) mais o mini-ICP do
onboarding (`day0_companies`: o que vende, para quem, por que compram) a fonte de ICP de toda função. O Playbook espalhava
a configuração comercial por dezesseis seções preenchidas à mão e não garantia que o ICP virasse um recorte executável de
empresas.

A spec `contexto-da-empresa` trocou isso pelo Contexto da empresa: três textos (Empresa, Perfil de cliente ideal e
Personas), gerados pelo site e editáveis pelo Administrador, com versão. Os tickets 01 a 06 levaram onboarding, Mercado,
Aderência, Agentes e Sequências para ele; o ticket 07 retirou o resto.

## Decisão

1. **A fonte de ICP de toda função é o Perfil de cliente ideal do Contexto da empresa vigente**, lido por
   `get_company_context` (com a sessão de quem pede) ou `company_context_for_workspace` / `agent_run_company_context`
   (servidor). Empresa e Personas vêm do mesmo contexto. Nenhuma função lê o Playbook nem o mini-ICP como fonte ou como
   reserva quando o contexto falta: sem contexto, a operação diz o que falta e leva a Configurações → Contexto da empresa.
2. **O mini-ICP do onboarding deixa de ser perguntado.** O onboarding coleta empresa e site e pede a geração do contexto.
   As colunas de `day0_companies` e a ação `produto` de `save_my_day0` ficam no banco, sem uso pela tela.
3. **O Playbook sai do produto.** Sem tela, importação, edição, revisão por Agente nem leitura pelas Edge Functions ou pelo
   Canal. As entradas antigas (`/configuracoes/playbook`, `/configuracoes/memoria`) levam ao Contexto da empresa. O que
   dependia de seções que deixaram de existir não é recriado num Playbook oculto: a Cadência como modelo de Sequência deu
   lugar aos templates de Sequência; os critérios de passagem do kanban (seção SLA e metas) saíram.
4. **Nada é apagado.** As tabelas e funções do Playbook, as revisões antigas em Aprovações (só como registro; a pendente
   vence sem decisão), o mini-ICP gravado, as Contas-alvo e o histórico ficam como estão. As RPCs antigas continuam no banco
   sem uso; fechá-las ou apagar as tabelas é decisão à parte.

## Consequências

- As quatro Especialidades, a Coordenação sem quinto agente (ADR-0004), o catálogo sem Modelos, o Rhetor como quem escreve
  Sequência e o "tudo para a frente, sem `git revert`" da ADR-0034 continuam valendo.
- O rascunho de resposta do Rhetor (`reply_proposal_context`) e o Plano do Sinal (`signal-plan`) passam a ler os três
  textos; a prateleira "Para o seu nicho" do catálogo sai do Perfil de cliente ideal.
- Edições do contexto orientam as operações seguintes; buscas e Execuções já feitas guardam a versão que usaram.
