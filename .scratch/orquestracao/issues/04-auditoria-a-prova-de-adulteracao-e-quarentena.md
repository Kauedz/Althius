# 04: Auditoria à prova de adulteração e quarentena de ferramenta nova

**What to build:** dois furos de confiança que só aparecem quando alguém erra ou age de má-fé. (1) O histórico que prova quem decidiu o quê (`private.approval_events`) e o de Agentes (`private.agent_events`) são tabelas comuns: quem tem acesso privilegiado ao banco (o SQL Editor, uma migration, um erro) edita ou apaga uma linha e nada denuncia. Cada tabela ganha a coluna `prev_hash`, uma **cadeia de hash**: o hash de cada evento cobre o conteúdo dele e o `prev_hash` do anterior, e uma função verifica a cadeia e aponta onde ela quebra. É prova de adulteração (acusa), não barreira: quem tem o banco ainda consegue refazer a cadeia inteira, e o ticket diz isso na tela e nos critérios. (2) Um conector já ligado pode passar a oferecer ferramenta nova (o servidor MCP do app a acrescenta no `tools/list`): hoje, se o servidor a marca como leitura (`readOnlyHint`), ela roda sozinha. A ferramenta nova entra em **quarentena**, tratada como `aprovacao`, até o Administrador revisar.

**Blocked by:** 03: Execuções presas ou com falha. É a ordem do pacote (01 → 02 → 03 → 04); não há dependência técnica: este ticket não toca `agent_runs` nem o contrato de Execução.

**Status:** needs-triage (as dúvidas para o Renan abaixo trazem um padrão proposto; a de escopo da cadeia de Aprovações muda o desenho e vale responder antes)

## O que existe hoje (lido na `main` em 12/10/2026)

- `private.approval_events` (`20261001130000_aprovacoes_reais.sql:48`): `id` identity, `approval_id` (`on delete cascade`), `from_state`, `to_state`, `actor_user_id`, `note`, `created_at`. **Uma única porta de escrita:** `private.approval_transition` (`:71`), chamada pelas funções de Aprovação, redefinidas depois em `20261002110000_permissao_por_ferramenta.sql` (`:204`, `:229`, `:272`) e `20261009220509_revisao_do_playbook_por_aprovacao.sql` (`:108`, `:200`, `:247`, `:263`, `:278`, `:310`, `:376`). A leitura é `list_approval_events` (`:343`), com colunas explícitas (não devolveria uma coluna nova).
- `private.agent_events` (`20260929140000_agentes_e_permissoes.sql:199`): `id` identity, `workspace_id`, `agent_id`, `agent_name`, `event` (`agente_criado`, `agente_excluido`, `permissao_alterada`), permissões antiga e nova, `actor_user_id`, `created_at`. **Sem chave estrangeira para o Agente**, de propósito, para sobreviver à exclusão. As escritas são três `insert` dentro de `create_agent` (`:526`), `delete_agent` (`:557`) e `save_agent_settings` (`:625`). Nenhuma função lê a tabela: hoje só os testes a leem (`supabase/tests/agentes_e_permissoes.sql:508-521`).
- Excluir um Agente criado exclui as Aprovações dele (`foreign key ... on delete cascade`, `20261001130000_aprovacoes_reais.sql:35-38`, regra do glossário), e com elas os `approval_events`. Uma cadeia por Workspace quebraria no meio por uma exclusão legítima.
- O hash que existe hoje, `private.approval_payload_hash` (`:62`), é `md5` do payload: serve para conferir conteúdo, não resiste a adulteração. Não muda.
- A regra de ferramenta é `regraVigente` (`supabase/functions/_shared/integracoes/regras.ts:20-24`): a definida pelo Administrador, ou o padrão (leitura `sempre`, escrita `aprovacao`), com "escreve" vindo do `readOnlyHint` do servidor (ADR-0022). A decisão final é `decidirChamada` (`:30`), chamada por `_shared/integration-access.ts:424-451`; a lista de ferramentas vem do `tools/list` do servidor (`_shared/integracoes/mcp-cliente.ts:140`), consultada a cada uso. As regras ficam em `private.integration_tool_rules` (`20261002110000_permissao_por_ferramenta.sql:17`) e são lidas por `integration_tool_rules_for_use` e `set_integration_tool_rule`.
- No banco, a ADR-0022 já diz que, ao propor, "uma chamada sem regra" vira Aprovação; a quarentena é o que falta **no servidor**, onde a leitura sem regra roda direto.

## Desenho

### Cadeia de hash

- Migration aditiva: `prev_hash text` em `private.approval_events` e `private.agent_events`. O hash de uma linha é `encode(sha256(convert_to(prev_hash_da_linha || '|' || campos_canonicos, 'UTF8')), 'hex')`, com os campos em ordem fixa e `created_at` em texto ISO de microssegundos. A coluna guarda o hash do evento **anterior** da cadeia (o primeiro, `NULL`).
- Um gatilho `before insert` em cada tabela calcula `prev_hash` sob `pg_advisory_xact_lock(hashtext('audit:...'))`, sem mudar nenhuma função que escreve (`approval_transition` e os três `insert` de Agentes ficam intactos). Um gatilho `before update` recusa qualquer alteração dessas linhas.
- Cadeias: `approval_events` **por Aprovação** (`approval_id`, ordenada por `id`), porque a exclusão do Agente remove Aprovações inteiras; `agent_events` **por Workspace** (ordenada por `id`), porque a tabela sobrevive à exclusão. (Dúvida 1.)
- Backfill na própria migration, em ordem de `id`, para as linhas que já existem.
- `public.verify_audit_chain(p_workspace_id uuid)`: só Administrador ativo. Devolve, por tabela, quantos eventos verificou e a lista de quebras (`tabela`, `id`, `motivo`: `hash_diferente`, `elo_ausente`, `ordem_trocada`). Vazio = íntegra. Versão `service_role` para verificar qualquer Workspace.

### Quarentena

- Tabela `private.integration_tool_seen (workspace_id, integration_id, tool_name, first_seen_at, reviewed_at, reviewed_by)`, com RLS explícito. Quando a Integração é ligada num Workspace, as ferramentas que o servidor lista naquele momento entram como **conhecidas e revisadas por padrão** (`reviewed_at` preenchido, sem `reviewed_by`): a base de partida não vira Aprovação em massa.
- A cada uso, `integration-access.ts` compara a lista do `tools/list` com a tabela por uma RPC nova (`note_integration_tools`, só `service_role`). Nome nunca visto → linha nova com `reviewed_at` nulo = **em quarentena**. `regraVigente` ganha a entrada "quarentena": ferramenta em quarentena sem regra definida vale `aprovacao`, leitura ou escrita. A regra definida pelo Administrador vale sempre (`bloqueada` continua vencendo).
- O Administrador revisa por `set_integration_tool_rule` (qualquer regra, inclusive `sempre`, conta como revisão e preenche `reviewed_at`/`reviewed_by`) ou por `review_integration_tool(workspace, integração, ferramenta)`, que marca como revisada mantendo o padrão.
- A Aprovação gerada pela quarentena diz no `impact` que a ferramenta é nova e ainda não foi revisada.
- A tela de Conexões da Integração marca "Nova, aguardando revisão" e oferece o botão de revisar.

## Critérios

- [ ] Inserir três eventos de uma Aprovação grava `prev_hash` nulo no primeiro e, no segundo e no terceiro, o hash do anterior; os eventos de outra Aprovação têm cadeia própria. Idem `agent_events` por Workspace.
- [ ] Inserções concorrentes na mesma cadeia (duas transações) não geram o mesmo `prev_hash` para dois eventos: a segunda espera a trava (duas conexões ao banco local; se o pgTAP não conseguir simular, registrar como teste manual e provar a trava pela ordem dos `id`).
- [ ] `verify_audit_chain` devolve vazio para uma cadeia íntegra e, depois de `UPDATE` direto de qualquer campo de um evento do meio feito como superusuário, aponta esse evento com `hash_diferente`; depois de apagar um evento do meio, aponta o elo seguinte com `elo_ausente`; depois de trocar dois `id`, `ordem_trocada`.
- [ ] `UPDATE` em `approval_events` ou `agent_events` por qualquer papel, inclusive `service_role` e funções `security definer`, é recusado pelo gatilho. A exclusão de uma Aprovação (e a do Agente que a cascateia) continua funcionando e **não** é acusada como adulteração.
- [ ] As linhas que já existem recebem `prev_hash` no backfill, e `verify_audit_chain` as dá como íntegras logo depois da migration.
- [ ] Limite documentado e testado: o **último** evento de uma cadeia só é selado pelo próximo; apagar o último evento não é detectado. O texto da função e do ticket diz isso.
- [ ] `verify_audit_chain` recusa quem não é Administrador ativo do Workspace e nunca devolve evento de outro Workspace; `list_approval_events` continua devolvendo as mesmas colunas (o `prev_hash` não vaza).
- [ ] Os pgTAP antigos `aprovacoes_reais.sql`, `permissao_por_ferramenta.sql`, `revisao_do_playbook_por_aprovacao.sql` e `agentes_e_permissoes.sql` passam **sem edição** (só há linhas e colunas a mais).
- [ ] Quarentena: ferramenta de leitura nunca vista, num conector já ligado, sem regra definida, **pede Aprovação** (Deno: `decidirChamada` retorna `pede_aprovacao`, com Permissão Executar e `sempre` não definido). Depois de o Administrador revisar, volta a rodar como leitura. A de escrita nunca vista também pede Aprovação, como já era.
- [ ] Ferramenta que já estava no `tools/list` quando a Integração foi ligada não entra em quarentena. Uma ferramenta renomeada pelo app é nova (a regra volta ao padrão, ADR-0022) e entra em quarentena.
- [ ] Regra `bloqueada` vence a quarentena; regra `sempre` definida pelo Administrador a encerra; a regra de um Workspace nunca revisa a de outro.
- [ ] `claim_approved_action` de uma Aprovação nascida da quarentena continua conferindo o payload exato e a regra: uma ferramenta que o Administrador bloqueou entre a aprovação e a execução não sai (comportamento da ADR-0022 preservado, com teste novo).
- [ ] A tela de Conexões mostra o selo e o botão de revisar só ao Administrador, e Membros veem o selo sem o botão (vitest).

## Pode mexer

- Uma migration nova, com timestamp UTC maior que a última da `main`, e um pgTAP novo: `supabase/tests/auditoria_encadeada_e_quarentena.sql`.
- Os dois gatilhos, `verify_audit_chain`, `private.integration_tool_seen`, `note_integration_tools` e `review_integration_tool`.
- `set_integration_tool_rule`, redefinida a partir da definição mais recente da `main`, só para preencher a revisão.
- `supabase/functions/_shared/integracoes/regras.ts` (`regraVigente`) e `supabase/functions/_shared/integration-access.ts` (a chamada à RPC e o novo argumento), `_shared/integracoes/banco-supabase.ts` (a RPC nova), com testes Deno novos.
- A tela de Conexões da Integração, só o selo e o botão de revisar, e a Fonte dela.

## Não mexa

- Em `approval_transition`, `decide_approval`, `cancel_approval`, `propose_agent_action`, `create_agent`, `delete_agent` e `save_agent_settings`: a cadeia entra por gatilho, sem tocar quem escreve.
- Em `private.approval_payload_hash` (o `md5` do payload fica como está).
- Em `mcp-cliente.ts`, nos perfis de conector e nos arquivos de `_shared/integracoes/` que não sejam os listados acima.
- Em testes existentes: um ticket só acrescenta testes.
- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Não agenda verificação periódica da cadeia nem notificação de quebra: a função é chamada sob demanda neste ticket (dúvida 4).

## Arquivos compartilhados com a área do Renan

- **Aprovações (crm-real-e-stack 15, a fila):** `20261001130000_aprovacoes_reais.sql` (`approval_events`, `approval_transition`, `list_approval_events`), `20261002110000_permissao_por_ferramenta.sql` e `20261009220509_revisao_do_playbook_por_aprovacao.sql`; `projeto-althius-frontend/src/fonte/supabase-aprovacoes.ts` (só leitura).
- **Conexões:** `supabase/functions/_shared/integracoes/regras.ts`, `integration-access.ts`, `integracoes/banco-supabase.ts`, `20261002110000_permissao_por_ferramenta.sql` (`set_integration_tool_rule`, `integration_tool_rules_for_use`, `tool_approval`) e a tela `/conexoes`.
- **Agentes:** `20260929140000_agentes_e_permissoes.sql` (`agent_events`, `create_agent`, `delete_agent`, `save_agent_settings`), de `crm-real-e-stack` 13.
- Testes de leitura: `aprovacoes_reais.sql`, `permissao_por_ferramenta.sql`, `revisao_do_playbook_por_aprovacao.sql`, `agentes_e_permissoes.sql`, `ferramentas-dos-agentes-envio-ao-crm.test.ts`.

## Dúvidas para o Renan

1. **Cadeia de Aprovações por Aprovação ou por Workspace?** Por Workspace é mais forte (acusa remover uma Aprovação inteira) mas a exclusão legítima de um Agente criado cascateia Aprovações e quebraria a cadeia. Padrão proposto: por Aprovação, assumindo o limite de que remover uma Aprovação inteira não é acusado. Alternativa: gravar um evento-lápide em `agent_events` quando o `delete_agent` leva Aprovações junto, e manter uma cadeia por Workspace.
2. **A revisão é só `set_integration_tool_rule` ou há um botão "revisada, mantém o padrão"?** Padrão proposto: os dois, e qualquer regra já conta como revisão.
3. **Ferramenta que muda de leitura para escrita (ou o contrário) depois de revisada** volta à quarentena? Padrão proposto: não neste ticket, por ser outro vetor (o `readOnlyHint` é do servidor); anotar como risco aceito e abrir ticket se o Renan quiser.
4. **A verificação roda sozinha (job diário que grava um Aviso do Workspace se achar quebra)?** Padrão proposto: não neste ticket. A função fica disponível ao Administrador e ao Nan; o job é um ticket pequeno depois, porque o Aviso exige trocar o `check` de `kind` da tabela de Avisos (ver ticket 03).
5. **O gatilho que recusa `UPDATE` pode atrapalhar alguma frente?** Nenhuma função da `main` atualiza essas duas tabelas (conferido com busca); confirme que a frente de Aprovações não planeja corrigir `note` depois.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Aplicar a migration conforme `docs/agents/migrations.md`, com o CI verde e antes do merge. O backfill roda dentro dela; conferir logo depois, no SQL Editor, que `select * from public.verify_audit_chain('<id do Workspace>')` volta vazio (a função é do Administrador; o Nan usa a versão `service_role`). Como o ticket escreve em tabelas de auditoria que já têm linhas no projeto `ycbdilsmydvzezhlymty`, **a IA pergunta ao Nan antes** de aplicar (AGENTS.md: antes de qualquer coisa destrutiva no banco; o backfill só preenche uma coluna nova, mas toca dados reais).
2. Publicar as funções que usam a quarentena:
   ```powershell
   cd "$HOME\Althius"
   git checkout main
   git pull
   npx supabase functions deploy agent-conversation --project-ref ycbdilsmydvzezhlymty
   ```
   e reiniciar o worker do Hermes (`Ctrl+C` e ligar de novo, comando em `supabase/functions/_hermes-worker/README.md`). Se `integration-access.ts` é usado por outras Edge Functions, a IA lista quais antes e o Nan publica todas.
3. Conferência real: num Workspace de teste com um conector já ligado, simular uma ferramenta nova no servidor falso e ver o botão de revisar. (A conferência visual é da IA; o Nan só liga o conector real, se quiser, depois do merge.)

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
