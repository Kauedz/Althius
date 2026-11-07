# 03: Configuração automática no onboarding

**What to build:** Informar empresa e site no onboarding e receber contexto pronto; retomar depois quando a etapa for pulada, inclusive em Workspaces existentes.

**Blocked by:** 02: Gerar contexto pelo site e revisar novas gerações

**Status:** in-review (implementado; falta o pgTAP rodar no CI, aplicar a migration no remoto antes do merge e publicar a função do ticket 02)

**Referência:** spec Contexto da empresa — experiência do AI Context do Clay, aprovada em 05/11/2026. Divisão aprovada para publicação em 06/11/2026.

## Critérios de aceite

- [x] Empresa e site iniciam a geração do ticket 02, sem confirmação adicional após sucesso.
- [x] Pular não bloqueia a entrada geral; Configurações permite informar o site depois.
- [x] Falha é comunicada e permite concluir o onboarding, tentar novamente ou editar manualmente.
- [x] Retirar o questionário obrigatório de mini-ICP como fonte concorrente.
- [x] Workspace existente usa o site cadastrado ou solicita seu preenchimento; gera conteúdo do zero, sem copiar ou resumir o Playbook.
- [x] Retomada e recarregamento não repetem a geração indevidamente; participante sem permissão não pode substituir contexto do Workspace.
- [x] Operações que requerem ICP suficiente comunicam a pendência e encaminham para a configuração, sem bloquear funções independentes.

## Pode mexer

Onboarding, cadastro de empresa/site, retomada em Configurações e estados de pendência do contexto.

## Não mexa

Exclusão de dados antigos, reclassificação de Contas-alvo e remoção global do Playbook antes do ticket 07.

## Validação

Testar percurso novo, etapa pulada, Workspace existente com e sem site, falha, retomada e vigência automática.

Cada entrega mantém os checks aplicáveis verdes. Respeitar as regras de migrations e publicação do projeto. Documentar na entrega comandos PowerShell e ações humanas realmente necessários quando houver deploy ou atualização de banco; não inventar nomes de funções ou comandos antes da implementação.

## Execução

Implementar apenas após os bloqueadores. Consultar a spec completa e as regras do projeto. A coexistência técnica necessária durante a migração é temporária; a experiência final tem somente os três textos do Contexto. Não reutilizar dados do Playbook para preencher o novo conteúdo.

## Comments

- 2026-11-06: implementado na branch `contexto-da-empresa-03-onboarding`.
  - Banco: `20261221020000_onboarding_do_contexto.sql` acrescenta `day0_companies.site_skipped` e redefine `get_my_day0` (de `20261214102000`) e `save_my_day0` (de `20261219030000`) com a ação `pular_site`: só o Administrador original, sem valor, e só vale enquanto não há site. Com o site pulado o Day0 não para no passo do site e devolve `sitePulado`; informado o site (no Day0 ou em Configurações, por `start_company_context_generation`), o pulo deixa de valer. pgTAP `onboarding_do_contexto.sql` (16). Sem Docker nem MCP do Supabase nesta máquina: o pgTAP roda pela primeira vez no CI.
  - Tela: confirmar o site no Day0 (operacional e Demonstração) pede a geração do ticket 02 sem outra confirmação (`gerarContextoDoOnboarding`), só quando não há contexto vigente nem leitura em andamento; recarregar ou retomar não pede de novo. "Informar o site depois" segue o Day0. No fim do Day0 (e no item 1 do checklist da Demonstração) o painel mostra andamento, vigente, falha com o motivo, Tentar de novo, Escrever à mão em Configurações, ou o site pulado com o link para informá-lo; nada impede concluir. Um erro ao começar a leitura (função não publicada, rede) aparece com o motivo.
  - Mini-ICP: o questionário (mini-ICP e Personas do onboarding) saiu da tela e das Fontes. A ação `produto` e as colunas ficam no banco, sem uso, porque pgTAP antigos ainda as exercitam e não podem ser alterados; `signal-plan` ainda lê esses campos: auditar e retirar no ticket 07.
  - Pendência: `AvisoDoContextoPendente` (sem site, sem contexto, gerando, falha) com link para Configurações, sem bloquear; usado por ora no diálogo de busca do Mercado. Agentes, Aderência e Sequências ganham o aviso quando passarem a usar o contexto (tickets 04–06).
  - Workspace existente: Configurações (ticket 02) já usa o site cadastrado ou pede o site; nada é copiado do Playbook.
  - Fora do escopo, anotado: trocar o domínio no Day0 com contexto já vigente atualiza o site cadastrado sem gerar de novo (a nova leitura é decisão do Administrador em Configurações). No Workspace operacional a Casca não lê o contexto: o checklist só existe na Demonstração.
  - Testes: vitest `contexto-no-onboarding.test.ts` (5), `aviso-do-contexto-pendente.test.tsx` (5), `day0-operacional.test.tsx` (14), `onboarding.test.tsx` (44), `supabase-onboarding.test.ts` (3), `regras-onboarding.test.ts` (5). Suíte completa verde exceto `gaveta-de-historico.test.tsx`, que já falha na `main`.
  - Passos do Nan: nenhum novo além dos do ticket 02 (publicar `company-context-generation`). A migration é aplicada pelo agente no remoto, pelo `docs/agents/migrations.md`, quando o CI ficar verde e antes do merge.
