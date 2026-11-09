# 06: Agentes e Sequências usam Contexto da empresa

**What to build:** Conversar com os quatro especialistas e gerar Sequências usando os três textos vigentes, sem depender de seções do Playbook.

**Blocked by:** 01: Contexto da empresa com os três textos, como no Clay

**Status:** in-review (implementado; falta o pgTAP rodar no CI, aplicar a migration no remoto antes do merge e publicar as duas funções)

**Referência:** spec Contexto da empresa — experiência do AI Context do Clay, aprovada em 05/11/2026. Divisão aprovada para publicação em 06/11/2026.

## Critérios de aceite

- [x] Scopus, Ethos, Rhetor e Oraculum recebem contexto adequado e versão vigente, preservando seus papéis.
- [x] Rhetor gera Sequência usando Empresa, ICP, Personas e configurações próprias do fluxo de Sequências.
- [x] Retirar consultas operacionais às seções antigas nos consumidores deste ticket; não criar Playbook oculto nem importar seu conteúdo.
- [x] Dados operacionais faltantes são obtidos no fluxo correspondente sem inventar scripts, SLA ou cadência.
- [x] Salvar nova versão afeta próximas execuções; conversas, propostas e Sequências existentes preservam histórico e configuração.
- [x] Manter permissão exclusiva de Administrador para alterar o contexto; ferramentas antigas não podem contornar essa regra.
- [x] Ausência de contexto é comunicada e encaminhada para configuração quando necessária.

## Pode mexer

Fornecimento de contexto aos especialistas, ferramentas de memória afetadas, geração de Sequências e testes de execução relacionados.

## Não mexa

Motor de envio e agendamento de cadências, substituição das Especialidades, regras de cobrança e migração destrutiva.

## Validação

Testar respostas e geração com contexto manual, edição entre execuções, ausência de contexto e regressão de Sequências do Rhetor.

Cada entrega mantém os checks aplicáveis verdes. Respeitar as regras de migrations e publicação do projeto. Documentar na entrega comandos PowerShell e ações humanas realmente necessários quando houver deploy ou atualização de banco; não inventar nomes de funções ou comandos antes da implementação.

## Execução

Implementar apenas após os bloqueadores. Consultar a spec completa e as regras do projeto. A coexistência técnica necessária durante a migração é temporária; a experiência final tem somente os três textos do Contexto. Não reutilizar dados do Playbook para preencher o novo conteúdo.

## Comments

- 2026-11-07: implementado na branch `contexto-da-empresa-03-onboarding`.
  - Banco: `20261221040000_agentes_pelo_contexto.sql` acrescenta `agent_runs.company_context_version` e a função `agent_run_company_context` (só `service_role`): a primeira leitura da Execução fixa a versão vigente (0 sem contexto) e as seguintes devolvem a mesma, mesmo que um Administrador salve outra no meio; a próxima Execução já usa a nova. `compute_agent_prompt_suggestions` (redefinida de `20261023100000`) olha o ICP e as Personas do contexto, não as seções do Playbook; sem eles, os Agentes oferecem ajudar a escrever, e a sugestão do Rhetor não inventa mais "4 passos". `agent_run_playbook` e `agent_propose_playbook_revision` ficam no banco sem uso pelo motor (retirada no ticket 07, sem migração destrutiva). pgTAP novo `agentes_pelo_contexto.sql` (16).
  - Motor (`_shared/orquestracao.ts`, worker do Hermes e `agent-conversation`): `leitorDoContexto` lê o contexto uma vez por Execução e `contextoDaEmpresa` escreve os três textos com a versão, o foco de cada Especialidade (Scopus: ICP; Ethos: Personas; Rhetor: Empresa e Personas; Oraculum: Empresa), o que falta e a regra de não inventar cadência, scripts, templates, SLA nem critérios de passagem. Sem contexto, o Agente pergunta o que a empresa vende e leva a Configurações → Contexto da empresa; falha de leitura vira aviso, não contexto vazio. O Agente não altera o contexto: só o Administrador.
  - Ferramentas: `propor_mudanca_no_playbook` saiu do catálogo (um pedido dela vira passo recusado, sem Aprovação). `propor_sequencia` escreve pela Empresa, Personas e ICP; a cadência vem do pedido ou do template, e sem nenhum segue o padrão de 3 e-mails com `cadencia_padrao` (antes `playbook_vazio`) e o aviso. `buscar_contas_pelo_icp`, `propor_aderencia` e `sugerir_template_de_sequencia` citam o Perfil de cliente ideal do Contexto da empresa.
  - Tela: o pedido do "Gerar Sequência" cita o Contexto da empresa; o cartão de Sequência do detalhe da Conta mostra `AvisoDoContextoPendente` ("A Sequência pelo Rhetor") no Workspace operacional, sem bloquear.
  - Fica para o ticket 07: `reply-proposal-runner` (rascunho de resposta do Rhetor ainda lê o Playbook), `signal-plan`, as leituras de Playbook do Canal WhatsApp, e `pedir-ao-ethos.tsx`. O cache de sugestões (até 6 h) não é invalidado quando o contexto é salvo.
  - Testes: deno `orquestracao-contexto.test.ts` (11), `worker-por-agente`, `runner-rodadas`, `ferramentas-dos-agentes-sequencia` (13), `worker-contexto-so-do-administrador` (2); suíte Deno 2019/0; vitest `gerar-sequencia.test.tsx` (9), suíte 2164 com a falha conhecida de `gaveta-de-historico.test.tsx`; `tsc -b`, oxlint e `deno check` limpos. O pgTAP roda no CI (sem Docker na máquina).
  - Passos do Nan: aplicar a migração de Agentes, publicar `agent-conversation` e reiniciar o worker do Hermes na
    [ordem de publicação da spec](../validacao.md#ordem-de-publicação). Nenhum segredo novo.
- 2026-11-07: a pedido do usuário, a criação manual de Sequências também saiu do Playbook neste ticket.
  - Criação em lote (`dialogo-criacao-em-lote.tsx`): a cadência vem de um template do fluxo de Sequências, da Althius ou próprio, escolhido em "Template das Sequências", com a lista de passos e a prévia do primeiro. Sem escolha, nada é criado ("Escolha um template da Althius ou um template seu"); antes, sem a Cadência do Playbook, o lote não criava nada. O banco (`create_sequences_in_batch`) não muda.
  - Nova sequência (`nova-sequencia.tsx`): sai a opção "Usar a Cadência do Playbook como modelo"; ficam os templates da Althius, os próprios e o "do zero". `fonte/modelo-de-cadencia.ts` (e o teste) saiu, sem uso.
  - Testes: vitest `criacao-em-lote-de-sequencias.test.tsx` (2), `sequencias.test.tsx`, `templates-althius-na-criacao.test.tsx` e `templates-proprios-na-criacao.test.tsx` (29 ao todo); suíte 2158 com a falha conhecida de `gaveta-de-historico.test.tsx` e uma falha intermitente de `contexto-da-empresa-geracao.test.tsx` (passa isolada em 2 de 3 rodadas e não toca Sequências). Conferência visual na Demonstração em 2026-11-07: o diálogo de lote mostra o template, os passos e a prévia, e só habilita "Confirmar criação" com template escolhido.
