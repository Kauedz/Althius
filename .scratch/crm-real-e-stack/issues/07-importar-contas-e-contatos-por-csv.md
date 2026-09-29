# 07: Importar Contas e Contatos por CSV

**What to build:** participante importa um CSV com prévia e validação, confirma as correspondências e acompanha o processamento até obter um relatório real por linha.

**Blocked by:** 05: Manter Contatos e Vínculos do Contato; 06: Atribuir responsabilidade e distribuir recomendações pela roleta.

**Status:** ready-for-human

- [x] Arquivo é enviado para Storage privado e processado em `import_batch` durável; browser não grava linhas comerciais diretamente. — Edge Function `csv-import` guarda o arquivo no bucket privado `csv-imports` (sem política de Storage para o navegador) e o lote em `private.import_batches`/`import_rows`; `private.*` sem grant, só as RPCs escrevem. pgTAP `importacao_csv.sql` 1–2, 6–11; Deno `csv-import/handler.test.ts`; `importar-contas.test.tsx`.
- [x] Prévia permite mapear colunas, revisar correspondências, conflitos, linhas inválidas e possíveis vínculos antes do commit. — `preview_import_batch` (mapeamento, cabeçalho, substituir manuais), `list_import_rows` com filtros (decisões, conflitos, inválidas), `set_import_decisions`; tela `/contas/importar`. pgTAP `importacao_csv.sql`; `importar-contas.test.tsx` "envia o arquivo, mapeia…".
- [x] URL da empresa e nome da empresa são obrigatórios; nome do Contato é obrigatório ao importar Contato; LinkedIn, telefone e e-mail podem faltar. — validação por linha (`company_*_required/invalid`, `contact_name_required`, e-mail/telefone inválidos); canal ausente não bloqueia. pgTAP `importacao_csv.sql`.
- [x] Correspondência por URL atualiza Conta; campo vazio não apaga dado; campo não vazio atualiza o campo mapeado conforme origem e correção manual. — origem por campo (`account_field_sources`, `contact_field_sources`, gatilhos): manual só é trocado com a confirmação do lote; célula vazia nunca apaga. pgTAP `importacao_csv.sql`.
- [x] Contato existente oferece atualizar dados, adicionar vínculo ou transferir vínculo; nome sozinho não deduplica. — decisões `update`/`link`/`transfer`/`skip`; só e-mail, telefone ou LinkedIn identificam o Contato. pgTAP `importacao_csv.sql`.
- [x] Importador é responsável inicial; Administrador consegue distribuir linhas entre participantes ativos. — `create_imported_target_account` (CRM-06) com o lote na auditoria; `list_import_distributable_accounts` + `distribute_imported_target_accounts` na tela, só Administrador. pgTAP `importacao_csv.sql`; teste da tela "o Administrador distribui…".
- [x] Lotes são retomáveis e idempotentes; a tela apresenta progresso e contagens de criadas, atualizadas, vinculadas, ignoradas e com falha. — `process_import_chunk` (uma subtransação por linha, lote travado), tela com progresso e as cinco contagens; retomar reabrindo o lote. pgTAP `importacao_csv.sql`; 5.000 linhas: prévia ~1 s, bloco de 500 ~0,6 s.
- [x] Relatório de erros pode ser consultado/baixado sem expor arquivo a outro Workspace. — `list_import_rows(problems)` e "Baixar erros/relatório completo (CSV)"; só quem importou ou o Administrador do Workspace lê o lote. **Aberto:** o arquivo original fica no bucket sem prazo de retenção (falta um job de limpeza).

## Comments

- **Modelo (2026-09-29):** migration `supabase/migrations/20260929150000_importacao_csv.sql`; tabelas só no schema `private` (RLS ligada, sem grant), acesso por RPCs `security definer`.
  - `import_batches` (estado: uploading, mapping, preview, processing, completed, failed, cancelled) e `import_rows` (uma linha por registro, com valores normalizados, prévia, decisão, motivos e resultado).
  - `account_field_sources` e `contact_field_sources`: quem escreveu cada campo. Gatilhos em `target_accounts` e `contacts` marcam como manual (pessoa no app) ou automático (sem usuário) o que muda fora da importação. Campo sem origem registrada conta como manual.
  - Bucket `csv-imports` criado pela migration só onde o Storage existe (o runner local e o CI não têm).
- **Fluxo:** o navegador manda o arquivo à Edge Function `csv-import`; ela abre o lote com a sessão de quem pede, grava o arquivo, lê o CSV (UTF-8 ou Windows-1252, delimitador, cabeçalho, aspas, mapeamento sugerido) e entrega as linhas ao banco com a chave de serviço. Mapear, prévia, decisões, confirmar, processar e relatório são RPCs chamadas pelo navegador.
- **Decisões de produto (sem bloquear):**
  - O processamento em blocos é dirigido pela tela aberta (chama `process_import_chunk` até acabar). Fechar a aba pausa; reabrir o lote (Importações recentes) retoma. A spec fala em job durável (PGMQ/cron); não há worker de fundo nesta entrega.
  - Só quem importou processa e altera o lote; o Administrador o consulta e distribui as Contas.
  - Conta que já existe só é atualizada por quem responde por ela (regra do CRM-04). Para os outros a linha fica ignorada (`account_not_responsible`), mas o Administrador ainda gerencia os Contatos dela.
  - Atualizar, vincular e transferir são escolhas exclusivas: vincular e transferir não alteram os dados do Contato. Transferir encerra todos os outros Vínculos ativos, e só vale se quem importa gerencia todos.
  - Nada decide por padrão o Contato que já existe e ainda não tem Vínculo com a Conta: a confirmação exige a escolha (há "aplicar a todos"). Contato já vinculado à Conta da linha só tem os dados atualizados.
  - Linha inválida vira "com falha" na confirmação. Uma linha só com o nome do Contato cria sempre um Contato novo, então reimportar o mesmo arquivo repete esses.
  - Limites: 5 MB e 5.000 linhas de dados por arquivo.
  - Distribuição: a tela reparte as Contas do lote em rodízio entre os participantes escolhidos, usando `distribute_imported_target_accounts` sem mudá-la (janela de 24 h do CRM-06 mantida).
- **Não mexi** nas funções do outro desenvolvedor (`save_target_account`, `create_contact`, `update_contact`, `link_contact`, `end_contact_link`), no `sender-accounts`, no `unipile-account-status` nem no `/conexoes`; só as chamo (`private.open_contact_link`, `private.can_manage_account_contacts` e a primitiva do CRM-06).
- **Testes:** pgTAP `importacao_csv.sql` 82/82 e todos os outros arquivos verdes a partir de um banco novo; Deno `csv-import` 22 testes (92 no total); Vitest com `supabase-importacao.test.ts`, `relatorio-da-importacao.test.ts` e `importar-contas.test.tsx`.
- **Pendências:**
  - Retenção do arquivo: o CSV fica no bucket sem prazo. Falta um job que o apague (e as linhas cruas) depois de concluído.
  - Remoto: nada foi aplicado. Falta aplicar a migration (`docs/agents/migrations.md`), conferir o bucket `csv-imports` privado e publicar `csv-import`, sem segredo novo.
  - A tela de Contas ainda não mostra o responsável da Conta, então a Distribuição só aparece dentro do relatório da importação.
