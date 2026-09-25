# 04: Criar e consultar Contas-alvo reais

**What to build:** participantes operam Contas-alvo reais na experiência de Contas já existente, com cadastro manual, lista, busca, filtros, detalhe e contexto preservado ao voltar.

**Blocked by:** Auth-02: [Workspace pessoal criado no primeiro acesso](../../autenticacao-google-email/issues/02-workspace-pessoal-no-primeiro-acesso.md) (substitui o CRM-02).

**Status:** done (pending-apply da migration no Supabase remoto)

- [x] Contas-alvo têm identidade UUID persistente e pertencem a um Workspace. — `public.target_accounts` (id uuid, workspace_id FK public.workspaces); pgTAP `supabase/tests/contas_alvo_reais.sql` 1–2.
- [x] Participante autorizado cria e consulta Contas; Administrador pode consultar todas as Contas do Workspace. — RLS por Participação ativa + RPC `save_target_account`; pgTAP 6, 15, 21–24.
- [x] URL canônica corresponde a Conta existente para atualização; domínio ou identificador legal isolados não mesclam registros. — `private.canonical_company_url` + unique (workspace_id, canonical_url); pgTAP 3, 7–10, 19–20.
- [x] A tela existente lê dados reais e preserva busca, filtros, ordenação, navegação ao detalhe e estado ao voltar. — `src/fonte/supabase-contas.ts` na composição do Workspace operacional; `src/raiz.test.tsx` "lista as Contas do Workspace, busca, abre o detalhe e volta com a busca" (o recorte no endereço e a migalha são os da tela existente).
- [x] Detalhe apresenta dados existentes, estados vazios, carregamento, erro, retry e Conta não encontrada sem preencher lacunas com fixtures. — raiz.test "o detalhe mostra só o que existe…" e "…aparece como não encontrada" (também `/contas/openai`); erro/retry da Conta já existiam, acrescentado erro/retry em Interações; `supabase-contas.test.ts` cobre não encontrada (UUID e não-UUID).
- [x] Responsabilidade inicial manual é o criador; o backend impede edição de Conta fora da responsabilidade do Membro. — pgTAP 5, 12, 17; raiz.test "a pessoa cadastra uma Conta-alvo manualmente…".
- [x] Um responsável pode registrar uma Interação comercial manual na Conta e ver o evento no histórico correspondente. — RPC `register_account_interaction` + `public.account_interactions`; pgTAP 13–14, 16, 18; raiz.test "o Vendedor responsável registra uma Interação manual…" e "quem não é o Vendedor responsável… não registra".

## Comments

- **Modelo:** migration `supabase/migrations/20260925150000_contas_alvo_reais.sql` — `target_accounts` (UUID, workspace_id FK workspaces, `canonical_url` única por Workspace, `domain` derivado, `legal_identifier` sem unicidade, `last_interaction_at`) e `account_interactions` (manual, ainda sem Contato). Leitura por RLS de Participação ativa (Administrador e Membro consultam todas); escrita só pelas RPCs `save_target_account` e `register_account_interaction` (security definer).
- **Responsabilidade (decisão):** gravada em `public.sales_responsibilities` com o UUID da Conta **como texto** — fonte única, imutável pelo trigger existente e compatível com `create_sequence`. Nada foi migrado para FK UUID (isso é o CRM-17). Só o responsável atualiza a Conta (um Administrador também não edita a de outro) e registra Interação.
- **Tela:** `contas` saiu de `indisponiveis`; entrou o módulo `contatos`, que mantém /contatos e a criação de Sequência indisponíveis até o CRM-05. Cadastro manual mínimo na lista ("Nova Conta-alvo", só quando a fonte tem `salvarConta`; a Demonstração não mudou). Formulário "Registrar interação" no detalhe só quando `sobMinhaResponsabilidade`. `Interacao.contatoId` passou a opcional.
- **Pendências:** pending-apply da migration no Supabase remoto (sem acesso aqui). CRM-05 deve acrescentar `contact_id` em `account_interactions` e ler Contatos no adapter; Aderência, Sinais e origem da Conta continuam vazios.
