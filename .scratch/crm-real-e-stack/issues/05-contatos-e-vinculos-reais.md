# 05: Manter Contatos e Vínculos do Contato

**What to build:** participantes mantêm a identidade de um Contato no Workspace e administram seus vínculos com Contas-alvo, conservando a história da empresa onde cada Interação aconteceu.

**Blocked by:** 04: Criar e consultar Contas-alvo reais.

**Status:** closed

- [x] Contato possui identidade persistente única por Workspace, com e-mail, telefone e LinkedIn opcionais. — `public.contacts` (UUID, índices únicos parciais por Workspace); pgTAP `contatos_e_vinculos.sql` 1–10, 33.
- [x] Cadastro, leitura, edição, busca, filtros e detalhe usam dados reais na experiência existente. — adapter `supabase-contas.ts` (visão `target_contacts`, RPCs `create_contact`/`update_contact`); 'contatos' saiu de `indisponiveis`; `raiz.test.tsx` "Contatos reais no Workspace operacional" e `supabase-contas.test.ts`.
- [x] Um Contato pode ter vínculos simultâneos com múltiplas Contas quando atua nelas; o nome sozinho não mescla Contatos. — `contact_account_links` (um ativo por Contato+Conta); pgTAP 5, 11–13, 36; raiz "cadastra um Contato... mesmo com o nome de outro" e "vincula... e encerra".
- [x] Encerrar vínculo e abrir outro preserva Interações anteriores na Conta de origem. — `end_contact_link`; `account_interactions.contact_id` exige Vínculo ativo; pgTAP 14–21.
- [x] Membro só cria/edita Contatos das Contas sob sua responsabilidade; Administrador tem permissões administrativas definidas. — Administrador ativo cria/edita/vincula/encerra em qualquer Conta do Workspace; pgTAP 22–30; raiz "quem não é o Vendedor responsável não cadastra".
- [x] Contato sem e-mail, telefone, LinkedIn ou foto continua consultável e exibe os fallbacks existentes. — pgTAP 6; raiz "lista os Contatos..." (iniciais RL, canais apagados); adapter mapeia sem campos.
- [x] Dados e vínculos respeitam isolamento por Workspace também em consultas e atualizações concorrentes. — RLS por Participação ativa, FKs compostas (workspace_id, …), índice único de Vínculo ativo, `for share` no Vínculo ao registrar Interação; pgTAP 31–32, 34–36.


## Comments

- CRM-05 (ralph/crm-05-contatos-e-vinculos): Contato canônico em `public.contacts` + Vínculos em `public.contact_account_links`. A tabela antiga `target_contacts` (canais-02) foi movida para `private.target_contacts_canais02` (dados preservados, fora da API); `public.target_contacts` agora é a visão dos Vínculos ativos com as mesmas colunas de destino (`email`, `whatsapp`, `linkedin_identity`) e `upsert_target_contact` mantém a assinatura, exigindo UUID de Conta-alvo real (contact_id vazio cria; UUID existente atualiza). Teste `documento_com_destinatarios_reais.sql` ajustado para Conta real: 12 ok antes e depois (mesmo erro pré-existente de `private`).
- Loop: pgTAP `contatos_e_vinculos.sql` 36/36 (vermelho antes: `create_contact` inexistente); vitest 602 verdes (6 vermelhos antes no adapter, 5 na raiz); tsc limpo; oxlint 34 avisos (base).
- Pending-apply: `supabase/migrations/20260925160000_contatos_e_vinculos.sql`. Pending-human: decidir o destino de linhas legadas em `private.target_contacts_canais02`, se houver no remoto.
- Revisão (ralph/revisao-correcoes): `update_contact` (e o caminho de edição de `upsert_target_contact`) agora exige, para não-Administrador, que TODOS os Vínculos ativos do Contato sejam de Contas sob sua responsabilidade — vincular um Contato existente não concede edição. Corrigido na própria migration 160000 (ainda não aplicada). pgTAP `contatos_e_vinculos.sql` 40/40 (3 vermelhos antes da correção).
- Editar Contato (2026-09-29, só frontend, sem migration): a tela não tinha como editar um Contato, embora `public.update_contact` já existisse. `FonteDeContas.editarContato?` (só no adapter real) chama a RPC com os cinco campos: texto vazio apaga cargo, e-mail, telefone ou LinkedIn (a RPC trata `''` como apagar e nulo como manter); o nome vazio é recusado no cliente. O botão "Editar" (lápis, diálogo "Editar Contato" com os mesmos campos e rótulos do cadastro) está na coluna Ações da tabela de Contatos e da lista de Contatos do detalhe da Conta. `Contato.podeEditar` segue a regra da RPC: Administrador, ou Vendedor responsável por TODAS as Contas onde o Contato tem Vínculo ativo (inclusive de Conta arquivada); por isso a leitura de Contatos passou a trazer sempre o Workspace inteiro e a filtrar por Conta no navegador. Quem pode arquivar mas não editar (Contato também em Conta de outro Vendedor) vê o Editar desligado com o motivo; quem não pode nada não vê o botão; a Demonstração não tem o método, então não tem o botão. As recusas do banco viram mensagens em português (e-mail, telefone ou LinkedIn de outro Contato; sem permissão). Depois de salvar, `notificar()` recarrega as listas e o LinkedIn novo libera o botão de foto (CRM-12). Testes: `supabase-contas.test.ts` e `editar-contato.test.tsx`.

## Aplicação (2026-09-25)

- As migrations `20260925160000_contatos_e_vinculos.sql` (versão revisada no Kauedz/Althius#30) e `20260925170000_bootstrap_preserva_aceite_dos_termos.sql` foram aplicadas no `ycbdilsmydvzezhlymty` num único bloco atômico. O texto gravado no histórico confere por md5 com os arquivos.
- Antes, em transação revertida: pgTAP `contatos_e_vinculos.sql` 40/40.
- A tabela antiga de destinatários (`private.target_contacts_canais02`) estava vazia, então não há dado a migrar para Contatos.
