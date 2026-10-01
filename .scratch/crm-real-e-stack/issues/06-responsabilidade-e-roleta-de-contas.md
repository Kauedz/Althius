# 06: Atribuir responsabilidade e distribuir recomendações pela roleta

**What to build:** Contas recomendadas como novas pela Althius entram no CRM e recebem automaticamente um responsável por roleta entre participantes ativos; Conta manual e CSV preservam suas atribuições próprias.

**Blocked by:** 03: Convidar e gerenciar participantes; 04: Criar e consultar Contas-alvo reais.

**Status:** ready-for-agent

- [ ] Uma recomendação real de Conta com URL ainda inexistente cria a Conta e a atribui automaticamente a Administrador ou Membro ativo. — **Só a porta de entrada está pronta:** a RPC `public.recommend_target_account` (só `service_role`) cria a Conta com `origin = 'recomendacao'` e a atribui pela roleta; pgTAP `supabase/tests/responsabilidade_e_roleta.sql` 1–3, 14–16, 54–55. Ainda não existe quem recomende: o runtime dos Agentes é o CRM-13/14. Fica aberto até um Agente real chamar a RPC.
- [x] Distribuição é rotativa, persistida e atômica mesmo com recomendações simultâneas. — cursor por Workspace em `private.account_roulette_cursors`, travado `FOR UPDATE`, com as Participações travadas `FOR SHARE` antes; pgTAP 4, 11–13, 53; experimento local com recomendações paralelas e uma remoção no meio (ver Comments).
- [x] Recomendação que atualiza URL já existente não cria nova atribuição nem avança a roleta. — só preenche campos vazios, e o que preencheu fica em `private.target_account_enrichments`; pgTAP 5–11.
- [x] Criação manual atribui ao criador; importação atribui inicialmente ao importador. — manual: `save_target_account` (CRM-04, inalterada), agora auditada pelo gatilho; importação: primitiva `private.create_imported_target_account`, que o CRM-07 chama; pgTAP 17, 19–24, 57.
- [x] Administrador pode distribuir linhas importadas entre participantes ativos; fluxo normal não permite reatribuições posteriores. — RPC `public.distribute_imported_target_accounts`: por lote, uma vez por Conta, até 24 h depois da importação, sem Sequência, tudo ou nada. Fora disso `sales_responsibilities` continua imutável; pgTAP 25–42. A tela da distribuição é do CRM-07.
- [x] Após saída do responsável, Administrador pode transferir para participante ativo por ação excepcional auditada. — Backend: RPC `public.transfer_target_account_responsibility` (pgTAP 43–51). Tela: ação "Transferir responsabilidade" no detalhe da Conta (`transferir-responsabilidade.tsx`), com testes de tela e da Fonte.
- [x] Auditoria registra origem, participantes elegíveis e responsável atribuído, sem permitir atribuição a Participação inativa. — `private.account_assignment_events`, gravado pelo gatilho `sales_responsibilities_audit` em toda atribuição e troca, inclusive por fora das RPCs; leitura por Administrador em `public.list_account_assignment_events`. O gatilho `sales_responsibilities_active_owner` recusa Participação inativa. pgTAP 10, 13, 17, 19, 40, 42, 50–52 (auditoria) e 4, 18, 22, 28, 46, 53 (Participação inativa).

## Comments

- **Modelo (2026-09-28, revisto em 2026-09-29):** migration `supabase/migrations/20260928234733_responsabilidade_e_roleta.sql`.
  - `public.target_accounts` ganhou `origin` (`manual`, `recomendacao`, `importacao`). O padrão `manual` cobre `save_target_account` sem alterá-la. `created_by` aceita nulo só quando a origem é recomendação.
  - `private.account_roulette_cursors`: uma linha por Workspace com o último responsável da roleta e a posição dele (entrada na Participação, depois o id). Guardar a posição, e não um índice, mantém o rodízio quando alguém sai ou entra.
  - `private.account_assignment_events` guarda:
    - a origem: `recomendacao`, `manual`, `importacao`, `distribuicao_importacao`, `transferencia`, `sequencia` ou `alteracao_direta`;
    - os elegíveis e o cursor antes e depois;
    - o responsável anterior e o novo;
    - quem agiu, o motivo e o lote da importação.

    Um `check` exige que o responsável esteja entre os elegíveis. As responsabilidades anteriores à migration entraram no histórico: `manual` para Contas-alvo e `sequencia` para os identificadores de texto.
  - `private.target_account_enrichments`: o que uma recomendação preencheu numa Conta já conhecida, com os campos e o responsável da Conta. Só é gravado quando algum campo muda.
  - Gatilhos em `sales_responsibilities`:
    - `sales_responsibilities_active_owner` recusa, em qualquer escrita, um responsável sem Participação ativa e trava a Participação `FOR SHARE`.
    - `sales_responsibilities_audit` grava o evento de toda atribuição e toda troca de responsável. As funções novas gravam antes o evento completo, e o gatilho o reconhece pela transação (`transaction_id`). O que vem de outro lugar ganha um evento próprio: o cadastro manual e `create_sequence` como `manual`/`sequencia`, e uma troca feita por SQL como `alteracao_direta`.
    - `private.prevent_responsibility_mutation` continua recusando toda mudança, exceto a da linha que a transação liberou (`private.change_responsible`). O cliente segue sem UPDATE na tabela.
  - Funções auxiliares, cada regra num lugar só:
    - `private.insert_target_account` (URL canônica, domínio, origem). A regra do domínio repete a de `save_target_account`, que é de outro desenvolvedor: as duas mudam juntas.
    - `private.initial_responsibility_origin` (`manual` × `sequencia`).
    - `private.responsibility_key` (a chave da linha liberada).
    - `private.lock_active_participants` e `private.lock_caller_membership`.
- **Quem chama:**
  - `recommend_target_account`: só `service_role`. A recomendação vem do runtime dos Agentes, no servidor, e o Workspace vem no pedido.
  - `distribute_imported_target_accounts`, `transfer_target_account_responsibility` e `list_account_assignment_events`: `authenticated`, com a Participação conferida pelo `auth.uid()`.
  - Distribuir, transferir e ler o histórico é só para Administrador. O histórico mostra os elegíveis, o cursor e os motivos das transferências. O responsável atual todo participante já vê em `sales_responsibilities`.
  - `anon` não executa nenhuma delas. `private.create_imported_target_account` não tem grant: só outra função do banco a chama.
- **Regras decididas:**
  - A roleta ordena os participantes ativos por entrada no Workspace (desempate pelo id) e dá a próxima Conta a quem vem depois do último que recebeu; do fim, volta ao começo. Quem sai é pulado; quem volta por convite retoma a posição de antes.
  - A recomendação de uma URL já existente só preenche campos vazios (nunca sobrescreve nome nem dado corrigido), registra o que preencheu e devolve o responsável atual.
  - **Distribuição da importação × "Admin atribui/redistribui linhas importadas":** a spec diz as duas coisas, e a decisão é que a redistribuição só existe como Distribuição da importação. Cada Conta importada é distribuída uma única vez, pelo lote (`p_import_batch_id`), até 24 horas depois de importada e enquanto não tem Sequência. Passado isso, vale "o fluxo normal não permite reatribuições posteriores". A janela é de 24 h por Conta, a partir da importação dela, porque o CRM-07 ainda não tem lote com estado de fechado. Quando o `import_batch` existir, o CRM-07 pode trocar a janela por "até o lote fechar".
  - Indicar o próprio importador na distribuição não gasta a vez nem deixa evento: a Conta fica como está e ainda pode ser distribuída na janela.
  - A transferência exige que o responsável atual não tenha mais Participação ativa, um Administrador ativo, um participante ativo como destino e um motivo.
  - Registrado em `CONTEXT.md` (Distribuição da importação, Transferência de responsabilidade, Vendedor responsável) e na ADR-0009.
- **Concorrência:**
  - Todas as funções travam na mesma ordem. Primeiro as Participações, inclusive a de quem chama (`FOR SHARE`). Depois o cursor ou a linha da responsabilidade (`FOR UPDATE`). Só então gravam Conta, responsabilidade e evento.
  - Por isso uma remoção ou um rebaixamento concorrente espera ou é visto: um Administrador rebaixado no meio não distribui nem transfere. E não se forma ciclo com o bloqueio do Workspace que o gatilho do último Administrador toma.
  - Recomendações simultâneas do mesmo Workspace passam uma de cada vez pelo cursor. A URL canônica única decide a corrida da mesma empresa sem consumir a roleta duas vezes.
  - Experimento local, fora do pgTAP (que roda numa transação só): 40 recomendações em paralelo (25 URLs distintas e 5 URLs repetidas 3 vezes) e a remoção de um Membro no meio. Resultado: 30 Contas, 30 eventos, rodízio 9/8/8/5 (o removido parou de receber), cadeia do cursor sem quebra e nenhuma atribuição a Participação inativa.
- **O que o CRM-07 chama:**
  - Conta nova de uma linha do CSV: `private.create_imported_target_account(p_workspace_id, p_importer_user_id, p_import_batch_id, p_name, p_url, p_legal_identifier, p_linkedin_url, p_segment)`.
    - Chamar de dentro da RPC ou do job de importação (`security definer`), depois de conferir o importador. O lote é obrigatório.
    - Devolve `(target_account_id, created)`. Com a URL já existente, devolve `created = false` e não mexe em nada: a atualização por campo e a correção manual são regras do CRM-07.
  - Distribuição pelo Administrador: `public.distribute_imported_target_accounts(p_workspace_id, p_import_batch_id, p_target_account_ids uuid[], p_user_ids uuid[])`.
    - As duas listas vão pareadas; devolve quantas Contas mudaram de responsável.
    - As recusas a traduzir:
      - `only administrators can distribute imported target accounts`
      - `an import batch is required`
      - `each target account needs one responsible seller`
      - `each target account can appear only once`
      - `the new responsible seller must be an active participant`
      - `only imported target accounts can be distributed`
      - `target account is not in this import batch`
      - `the distribution window of this import has closed`
      - `imported target account was already distributed`
      - `target account already has a sequence`
- **Pendências:**
  - **Porta de entrada sem produtor:** a recomendação real depende do runtime dos Agentes (CRM-13/14). Por isso o primeiro critério está aberto.
  - **Transferência sem tela:** a ação "Transferir responsabilidade" ficaria no detalhe da Conta, para o Administrador, quando o responsável não está mais entre os participantes ativos: seletor de participante ativo e motivo, chamando `transfer_target_account_responsibility`.
    - As recusas a traduzir: `the responsible seller is still an active participant`, `the new responsible seller must be an active participant`, `a reason is required to transfer responsibility` e `only administrators can transfer responsibility`.
    - A tela de Contas ainda não mostra o nome do responsável. Esta entrega não mexeu em `src/fonte/supabase-contas.ts` nem no detalhe da Conta, para não colidir com o CRM-10/11.
  - **Sequência depois da transferência:** a Sequência do antigo responsável não é transferida. O executor já bloqueia os envios dela (`owner_not_responsible`), mas o novo responsável não cria outra enquanto ela existir. Virou critério do CRM-17.
  - **Remoto:** migration não aplicada no `ycbdilsmydvzezhlymty`. Local: pgTAP 57/57 no arquivo novo e todos os arquivos verdes.

- **Transferência na tela (2026-10-01):** no detalhe da Conta, quando o Administrador vê que o responsável já não é Participante ativo (`responsavelAusente`, lido de `list_workspace_participants`), aparece o aviso e o botão "Transferir responsabilidade": escolhe-se um Participante ativo e escreve-se o motivo (obrigatório). As quatro recusas do banco aparecem em português. A Demonstração e quem não é Administrador não veem a ação (a fonte não informa `responsavelAusente`).
- Fora do "Pode mexer" deste ticket: nada além de `contas-tipos.ts`, `supabase-contas.ts` e `detalhe-conta.tsx` (fonte e tela de Contas). Nenhuma função SQL foi tocada.
