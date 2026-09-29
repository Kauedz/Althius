begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(82);

-- Workspace Norte: Ana (Administradora), Beto e Caio (Membros) e Dora (Participação removida). Eva administra o Sul.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('70000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('70000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'beto@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('70000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'caio@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('70000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'eva@sul.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('70000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'dora@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('71000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('71000000-0000-0000-0000-000000000002', 'empresa', 'Sul');

insert into public.workspace_memberships (workspace_id, user_id, role, active, created_at) values
  ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'admin', true, '2026-09-01T10:00:00Z'),
  ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 'member', true, '2026-09-02T10:00:00Z'),
  ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000003', 'member', true, '2026-09-03T10:00:00Z'),
  ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000005', 'member', false, '2026-09-04T10:00:00Z'),
  ('71000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000004', 'admin', true, '2026-09-01T10:00:00Z');

create temporary table ids (nome text primary key, id uuid) on commit drop;
grant all on ids to authenticated, service_role, anon;

-- O que já existia no Norte, cadastrado à mão: Beto responde pela Alfa (segmento Varejo) e tem três Contatos nela;
-- Ana responde pela Gama.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
insert into ids select 'alfa', id from public.save_target_account(
  '71000000-0000-0000-0000-000000000001', 'Alfa', 'alfa.com.br', p_segment => 'Varejo');
insert into ids select 'maria', id from public.create_contact(
  (select id from ids where nome = 'alfa'), 'Maria Souza', 'CFO', 'maria@alfa.com.br');
insert into ids select 'rui', id from public.create_contact(
  (select id from ids where nome = 'alfa'), 'Rui Lima', null, 'rui@alfa.com.br');
insert into ids select 'joao', id from public.create_contact(
  (select id from ids where nome = 'alfa'), 'João Dias', null, null, '(11) 97777-1111');
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);
insert into ids select 'gama', id from public.save_target_account('71000000-0000-0000-0000-000000000001', 'Gama', 'gama.com.br');

-- A origem por campo: o que uma pessoa escreveu no app é manual.
reset role;
select is(
  (select origin from private.account_field_sources
   where target_account_id = (select id from ids where nome = 'alfa') and field = 'segment'),
  'manual', 'o campo cadastrado à mão tem origem manual');
select is(
  (select origin from private.contact_field_sources
   where contact_id = (select id from ids where nome = 'maria') and field = 'role'),
  'manual', 'o campo do Contato cadastrado à mão também');

-- Beto abre o lote do arquivo; a Edge Function guarda as linhas com a chave de serviço.
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
insert into ids select 'lote', batch_id from public.create_import_batch(
  '71000000-0000-0000-0000-000000000001', 'contas.csv', 2048);
select is(
  (select storage_path from public.create_import_batch('71000000-0000-0000-0000-000000000001', 'outro.csv', 10) limit 1)
    like '71000000-0000-0000-0000-000000000001/%/arquivo.csv',
  true, 'o arquivo fica no bucket sob o Workspace do lote');
select throws_ok(
  $$select * from public.create_import_batch('71000000-0000-0000-0000-000000000001', 'grande.csv', 5242881)$$,
  '22023', 'file size must be between 1 byte and 5 MB', 'um arquivo maior que o limite é recusado');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  public.stage_import_rows((select id from ids where nome = 'lote'), $rows$[
    {"line": 1, "cells": ["Empresa","Site","Segmento","CNPJ","Contato","Cargo","E-mail","Telefone","LinkedIn"]},
    {"line": 2, "cells": ["Alfa Comercial","www.alfa.com.br","Indústria","12.345.678/0001-90","","","","",""]},
    {"line": 3, "cells": ["Beta SA","beta.com.br","Serviços","","Rita Lima","Diretora","rita@beta.com.br","",""]},
    {"line": 4, "cells": ["Gama","gama.com.br","","","","","","",""]},
    {"line": 5, "cells": ["Delta","delta.com.br","","","Maria Souza","","maria@alfa.com.br","",""]},
    {"line": 6, "cells": ["Épsilon","epsilon.com.br","","","Maria Souza","","","",""]},
    {"line": 7, "cells": ["Sem site","","","","","","","",""]},
    {"line": 8, "cells": ["Zeta","não é uma url","","","","","","",""]},
    {"line": 9, "cells": ["Eta","eta.com.br","","","","Gerente","","",""]},
    {"line": 10, "cells": ["Alfa","alfa.com.br","","","Paulo Reis","","","","https://www.linkedin.com/in/paulo-reis/"]},
    {"line": 11, "cells": ["Beta SA","beta.com.br","","","Rita Lima","Diretora Comercial","rita@beta.com.br","",""]},
    {"line": 12, "cells": ["Iota","iota.com.br","","","Fulano","","maria@alfa.com.br","(11) 97777-1111",""]},
    {"line": 13, "cells": ["Teta","teta.com.br","","","Rui Lima","","rui@alfa.com.br","",""]},
    {"line": 14, "cells": ["Alfa","alfa.com.br","","","Maria","","maria@alfa.com.br","",""]},
    {"line": 15, "cells": ["Beta SA","beta.com.br","","","João Dias","","","(11) 97777-1111",""]}
  ]$rows$::jsonb),
  15, 'a Edge Function guarda os registros lidos do arquivo');
select lives_ok(
  $$select public.finish_import_upload((select id from ids where nome = 'lote'), ',', true,
      '["Empresa","Site","Segmento","CNPJ","Contato","Cargo","E-mail","Telefone","LinkedIn"]'::jsonb, '{}'::jsonb)$$,
  'o arquivo lido deixa o lote esperando o mapeamento');
select throws_ok(
  $$select public.stage_import_rows((select id from ids where nome = 'lote'), '[]'::jsonb)$$,
  '22023', 'import batch is not receiving rows', 'um lote já lido não recebe mais linhas');

-- Só a chave de serviço guarda as linhas: o navegador nunca grava linha do lote.
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.stage_import_rows((select id from ids where nome = 'lote'), '[]'::jsonb)$$,
  '42501', null, 'um usuário autenticado não guarda linhas do lote');
select throws_ok(
  $$select * from private.import_rows$$, '42501', null, 'o usuário não lê as linhas do lote direto na tabela');
select throws_ok(
  $$insert into public.target_accounts (workspace_id, name, canonical_url, domain, created_by)
    values ('71000000-0000-0000-0000-000000000001', 'Direta', 'https://direta.com.br', 'direta.com.br',
            '70000000-0000-0000-0000-000000000002')$$,
  '42501', null, 'o navegador não grava Conta direto na tabela');

-- O mapeamento precisa apontar colunas que existem, ter empresa e URL e não repetir coluna.
select throws_ok(
  $$select public.preview_import_batch((select id from ids where nome = 'lote'), '{"company_name": 0}'::jsonb)$$,
  '22023', 'company name and company url columns are required', 'nome e URL da empresa precisam estar mapeados');
select throws_ok(
  $$select public.preview_import_batch((select id from ids where nome = 'lote'),
      '{"company_name": 0, "company_url": 0}'::jsonb)$$,
  '22023', 'a column can be mapped to one field only', 'uma coluna alimenta um campo só');
select throws_ok(
  $$select public.preview_import_batch((select id from ids where nome = 'lote'),
      '{"company_name": 0, "company_url": 12}'::jsonb)$$,
  '22023', 'mapped column does not exist', 'a coluna mapeada precisa existir no arquivo');
select throws_ok(
  $$select public.preview_import_batch((select id from ids where nome = 'lote'),
      '{"company_name": 0, "company_url": 1, "senha": 2}'::jsonb)$$,
  '22023', 'unknown import field senha', 'só campos conhecidos são mapeados');

-- A prévia.
create temporary table previa on commit drop as
  select public.preview_import_batch((select id from ids where nome = 'lote'),
    '{"company_name": 0, "company_url": 1, "company_segment": 2, "company_legal_identifier": 3, "contact_name": 4,
      "contact_role": 5, "contact_email": 6, "contact_phone": 7, "contact_linkedin": 8}'::jsonb) as resumo;
grant all on previa to authenticated, service_role;

select is((select resumo ->> 'status' from previa), 'preview', 'o lote validado fica em prévia');
select results_eq(
  $$select (resumo -> 'counts' ->> 'total')::int, (resumo -> 'counts' ->> 'pending')::int,
      (resumo -> 'counts' ->> 'invalid')::int from previa$$,
  $$values (14, 10, 4)$$,
  'a prévia conta 14 registros de dados: 10 válidos e 4 inválidos (o cabeçalho não conta)');
select results_eq(
  $$select (resumo -> 'preview' ->> 'account_create')::int, (resumo -> 'preview' ->> 'account_update')::int,
      (resumo -> 'preview' ->> 'account_skip')::int, (resumo -> 'preview' ->> 'contact_create')::int,
      (resumo -> 'preview' ->> 'contact_match')::int, (resumo -> 'preview' ->> 'decisions_pending')::int,
      (resumo -> 'preview' ->> 'conflicts')::int from previa$$,
  $$values (4, 5, 1, 3, 5, 3, 2)$$,
  'a prévia conta Contas novas, atualizadas e ignoradas, Contatos novos e correspondências, decisões e conflitos');
select results_eq(
  $$select line_number, error_codes from public.list_import_rows((select id from ids where nome = 'lote'), 'invalid')
    order by line_number$$,
  $$values (7, array['company_url_required']), (8, array['company_url_invalid']),
           (9, array['contact_name_required']), (12, array['contact_identity_conflict'])$$,
  'as linhas inválidas dizem por quê: URL ausente ou inválida, Contato sem nome, identidade em dois Contatos');
select is(
  (select preview ->> 'account_action' from public.list_import_rows((select id from ids where nome = 'lote')) where line_number = 4),
  'skip', 'a Conta de outro Vendedor responsável aparece como ignorada na prévia');
select results_eq(
  $$select preview -> 'account_conflicts', preview -> 'account_changes' from public.list_import_rows(
      (select id from ids where nome = 'lote')) where line_number = 2$$,
  $$values ('["name", "segment"]'::jsonb, '["legal_identifier"]'::jsonb)$$,
  'o CSV não troca nome nem segmento escritos à mão (conflito), mas preenche o campo vazio');
select results_eq(
  $$select preview ->> 'contact_match', preview ->> 'contact_linked', preview ->> 'needs_decision'
    from public.list_import_rows((select id from ids where nome = 'lote')) where line_number = 6$$,
  $$values ('none', 'false', 'false')$$,
  'o nome sozinho não corresponde a Contato: a linha só com o nome do Contato é um Contato novo');
select results_eq(
  $$select preview ->> 'contact_match', preview ->> 'needs_decision', preview ->> 'can_transfer'
    from public.list_import_rows((select id from ids where nome = 'lote')) where line_number = 5$$,
  $$values ('existing', 'true', 'true')$$,
  'o Contato que já existe (mesmo e-mail) e não tem Vínculo com a Conta da linha espera decisão');
select results_eq(
  $$select preview ->> 'contact_match', preview ->> 'needs_decision'
    from public.list_import_rows((select id from ids where nome = 'lote')) where line_number = 11$$,
  $$values ('in_file', 'false')$$,
  'o mesmo Contato repetido na mesma empresa do arquivo não pede decisão');

-- Confirmar exige a decisão de cada Contato que já existe.
select throws_ok(
  $$select public.confirm_import_batch((select id from ids where nome = 'lote'))$$,
  '22023', 'decisions are pending', 'não confirma com decisões pendentes');
select throws_ok(
  $$select public.set_import_decisions((select id from ids where nome = 'lote'), array[5], 'fundir')$$,
  '22023', 'unknown decision', 'só as opções do Contato existente valem');
select is(public.set_import_decisions((select id from ids where nome = 'lote'), array[5, 15], 'link'), 2,
  'a decisão de adicionar Vínculo vale para as linhas escolhidas');
select is(public.set_import_decisions((select id from ids where nome = 'lote'), array[13], 'transfer'), 1,
  'a decisão de transferir o Vínculo vale para a linha escolhida');
select is(public.set_import_decisions((select id from ids where nome = 'lote'), array[2], 'link'), 0,
  'uma linha que não espera decisão não recebe uma');

-- Nada foi gravado no Workspace até aqui.
reset role;
select is((select count(*)::int from public.target_accounts where workspace_id = '71000000-0000-0000-0000-000000000001'), 2,
  'a prévia não cria Contas');
select is((select count(*)::int from public.contacts where workspace_id = '71000000-0000-0000-0000-000000000001'), 3,
  'a prévia não cria Contatos');

-- Isolamento: quem não importou (Membro), quem é de outro Workspace e a Participação removida não veem o lote.
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.get_import_batch((select id from ids where nome = 'lote'))$$,
  'P0002', 'import batch not found', 'outro Membro do Workspace não vê o lote de Beto');
select throws_ok(
  $$select * from public.list_import_rows((select id from ids where nome = 'lote'))$$,
  'P0002', 'import batch not found', 'nem as linhas dele');
select is((select count(*)::int from public.list_import_batches('71000000-0000-0000-0000-000000000001')), 0,
  'a lista de lotes do Membro só traz os dele');
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$select public.get_import_batch((select id from ids where nome = 'lote'))$$,
  'P0002', 'import batch not found', 'o Administrador de outro Workspace não vê o lote');
select throws_ok(
  $$select * from public.create_import_batch('71000000-0000-0000-0000-000000000001', 'x.csv', 10)$$,
  '42501', 'active workspace membership required', 'quem não participa do Workspace não abre lote nele');
select throws_ok(
  $$select * from public.list_import_batches('71000000-0000-0000-0000-000000000001')$$,
  '42501', 'active workspace membership required', 'nem lista os lotes dele');
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$select * from public.create_import_batch('71000000-0000-0000-0000-000000000001', 'x.csv', 10)$$,
  '42501', 'active workspace membership required', 'a Participação removida não abre lote');
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);
select is((select (public.get_import_batch((select id from ids where nome = 'lote'))) ->> 'status'), 'preview',
  'o Administrador do Workspace consulta o lote de Beto');
select throws_ok(
  $$select public.process_import_chunk((select id from ids where nome = 'lote'))$$,
  'P0002', 'import batch not found', 'mas só quem importou altera ou processa o lote');
select is((select count(*)::int from public.list_import_batches('71000000-0000-0000-0000-000000000001')), 2,
  'o Administrador lista os lotes do Workspace, os dois que Beto abriu');

-- Confirmação e processamento em blocos.
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
select is((public.confirm_import_batch((select id from ids where nome = 'lote'))) ->> 'status', 'processing',
  'com as decisões dadas, o lote é confirmado');
select throws_ok(
  $$select public.preview_import_batch((select id from ids where nome = 'lote'), '{"company_name": 0, "company_url": 1}'::jsonb)$$,
  '22023', 'import batch can no longer be mapped', 'o lote confirmado não muda de mapeamento');
select results_eq(
  $$select (r -> 'counts' ->> 'pending')::int, (r -> 'counts' ->> 'failed')::int
    from (select public.process_import_chunk((select id from ids where nome = 'lote'), 4) as r) x$$,
  $$values (6, 4)$$,
  'o primeiro bloco processa 4 linhas; as 4 inválidas já constam como falhas');
select results_eq(
  $$select (r ->> 'status') from (select public.process_import_chunk((select id from ids where nome = 'lote'), 4) as r) x$$,
  $$values ('processing')$$, 'o lote segue em processamento enquanto há linha pendente');
select results_eq(
  $$select r ->> 'status', (r -> 'counts' ->> 'pending')::int
    from (select public.process_import_chunk((select id from ids where nome = 'lote'), 4) as r) x$$,
  $$values ('completed', 0)$$, 'o último bloco termina o lote');

create temporary table relatorio on commit drop as
  select public.get_import_batch((select id from ids where nome = 'lote')) as r;
grant all on relatorio to authenticated, service_role;
select results_eq(
  $$select (r -> 'counts' ->> 'created')::int, (r -> 'counts' ->> 'updated')::int, (r -> 'counts' ->> 'linked')::int,
      (r -> 'counts' ->> 'skipped')::int, (r -> 'counts' ->> 'failed')::int from relatorio$$,
  $$values (5, 2, 1, 2, 4)$$,
  'o relatório conta criadas, atualizadas, vinculadas, ignoradas e com falha');

-- Idempotência: repetir o bloco não repete linha nem duplica nada.
select is(
  (public.process_import_chunk((select id from ids where nome = 'lote'), 100)) -> 'counts',
  (select r -> 'counts' from relatorio), 'chamar o processamento de novo devolve o mesmo relatório');

reset role;
select is((select count(*)::int from public.target_accounts where workspace_id = '71000000-0000-0000-0000-000000000001'), 6,
  'o lote criou 4 Contas novas; a Alfa e a Gama seguem únicas');
select is((select count(*)::int from public.contacts where workspace_id = '71000000-0000-0000-0000-000000000001'
  and name = 'Maria Souza'), 2,
  'o nome sozinho não deduplica: a linha só com o nome criou outra Maria Souza');
select results_eq(
  $$select name, role, email from public.contacts where id = (select id from ids where nome = 'maria')$$,
  $$values ('Maria Souza', 'CFO', 'maria@alfa.com.br')$$,
  'célula vazia não apaga o cargo, e o nome escrito à mão não é trocado pelo CSV');
select results_eq(
  $$select name, segment, legal_identifier from public.target_accounts where id = (select id from ids where nome = 'alfa')$$,
  $$values ('Alfa', 'Varejo', '12.345.678/0001-90')$$,
  'a URL encontrou a Conta: campo vazio foi preenchido e nome e segmento manuais foram preservados');
select results_eq(
  $$select origin, source_id = (select id from ids where nome = 'lote') from private.account_field_sources
    where target_account_id = (select id from ids where nome = 'alfa') and field = 'legal_identifier'$$,
  $$values ('importacao', true)$$, 'o campo preenchido registra a importação e o lote como origem');
select is(
  (select origin from private.account_field_sources
   where target_account_id = (select id from ids where nome = 'alfa') and field = 'name'),
  'manual', 'o campo preservado continua manual');
select results_eq(
  $$select outcome -> 'preserved', outcome -> 'changed' from private.import_rows
    where batch_id = (select id from ids where nome = 'lote') and line_number = 2$$,
  $$values ('["account.name", "account.segment"]'::jsonb, '["account.legal_identifier"]'::jsonb)$$,
  'a linha registra o que mudou e o que foi preservado');
select results_eq(
  $$select role from public.contacts where email = 'rita@beta.com.br'$$,
  $$values ('Diretora Comercial')$$,
  'o dado que veio de importação é atualizado pela linha seguinte do arquivo');
select results_eq(
  $$select status, error_codes from private.import_rows
    where batch_id = (select id from ids where nome = 'lote') and line_number = 4$$,
  $$values ('skipped', array['account_not_responsible'])$$,
  'a Conta de outro Vendedor responsável não é atualizada pelo Membro');
select results_eq(
  $$select status, error_codes, outcome ->> 'contact' from private.import_rows
    where batch_id = (select id from ids where nome = 'lote') and line_number = 14$$,
  $$values ('skipped', array['no_changes'], 'unchanged')$$,
  'a linha que não muda nada é ignorada, com o motivo');

-- As opções do Contato que já existe.
select is(
  (select count(*)::int from public.contact_account_links
   where contact_id = (select id from ids where nome = 'maria') and ended_at is null), 2,
  'adicionar Vínculo: a Maria continua na Alfa e passou a estar na Delta');
select results_eq(
  $$select (ended_at is not null), (select count(*)::int from public.contact_account_links x
      where x.contact_id = l.contact_id and x.ended_at is null and x.target_account_id = (
        select id from public.target_accounts where canonical_url = 'https://teta.com.br'))
    from public.contact_account_links l
    where l.contact_id = (select id from ids where nome = 'rui') and l.target_account_id = (select id from ids where nome = 'alfa')$$,
  $$values (true, 1)$$,
  'transferir Vínculo: o do Rui com a Alfa terminou e o da Teta abriu');
select results_eq(
  $$select status, outcome ->> 'account', outcome ->> 'contact' from private.import_rows
    where batch_id = (select id from ids where nome = 'lote') and line_number = 15$$,
  $$values ('linked', 'unchanged', 'linked')$$,
  'a linha que só adiciona o Vínculo conta como vinculada');

-- O importador é o responsável inicial das Contas novas, e a auditoria guarda o lote.
select is(
  (select count(*)::int from public.sales_responsibilities r
   join public.target_accounts a on a.id::text = r.target_account_id
   where r.owner_user_id = '70000000-0000-0000-0000-000000000002' and a.origin = 'importacao'), 4,
  'as 4 Contas novas nasceram sob a responsabilidade de quem importou');
select is(
  (select count(*)::int from private.account_assignment_events
   where origin = 'importacao' and import_batch_id = (select id from ids where nome = 'lote')), 4,
  'a auditoria da atribuição guarda o lote');

-- O relatório de erros por linha, com o arquivo original e sem sair do Workspace do lote.
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
select results_eq(
  $$select line_number, status from public.list_import_rows((select id from ids where nome = 'lote'), 'problems')
    order by line_number$$,
  $$values (4, 'skipped'), (7, 'failed'), (8, 'failed'), (9, 'failed'), (12, 'failed')$$,
  'o relatório de problemas traz as falhas e as ignoradas com motivo, sem as que só não mudaram nada');
select is(
  (select cells ->> 0 from public.list_import_rows((select id from ids where nome = 'lote'), 'problems') where line_number = 8),
  'Zeta', 'o relatório devolve as células originais da linha');

-- Distribuição pelo Administrador (CRM-06) das Contas que o lote criou.
select throws_ok(
  $$select * from public.list_import_distributable_accounts((select id from ids where nome = 'lote'))$$,
  '42501', 'only administrators can distribute imported target accounts', 'o Membro não lista para distribuir');
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);
select is((select count(*)::int from public.list_import_distributable_accounts((select id from ids where nome = 'lote'))), 4,
  'o Administrador vê as 4 Contas que o lote criou');
select is(
  public.distribute_imported_target_accounts(
    '71000000-0000-0000-0000-000000000001', (select id from ids where nome = 'lote'),
    array[(select id from public.target_accounts where canonical_url = 'https://beta.com.br')],
    array['70000000-0000-0000-0000-000000000003'::uuid]),
  1, 'o Administrador distribui uma Conta do lote a outro participante ativo');
select is((select count(*)::int from public.list_import_distributable_accounts((select id from ids where nome = 'lote'))), 3,
  'a Conta distribuída sai da lista');

-- O Administrador importa: não edita a Conta de outro Vendedor, mas gerencia os Contatos dela.
insert into ids select 'lote_ana', batch_id from public.create_import_batch(
  '71000000-0000-0000-0000-000000000001', 'contatos.csv', 100);
set local role service_role;
select public.stage_import_rows((select id from ids where nome = 'lote_ana'), $rows$[
  {"line": 1, "cells": ["Empresa","Site","Contato","E-mail"]},
  {"line": 2, "cells": ["Alfa Nova","alfa.com.br","Lia Prado","lia@alfa.com.br"]}
]$rows$::jsonb);
select public.finish_import_upload((select id from ids where nome = 'lote_ana'), ';', true,
  '["Empresa","Site","Contato","E-mail"]'::jsonb, '{}'::jsonb);
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);
select is(
  (public.preview_import_batch((select id from ids where nome = 'lote_ana'),
    '{"company_name": 0, "company_url": 1, "contact_name": 2, "contact_email": 3}'::jsonb)) -> 'preview' ->> 'account_skip',
  '1', 'a prévia do Administrador ignora a Conta de outro Vendedor responsável');
select is(
  (public.confirm_import_batch((select id from ids where nome = 'lote_ana'))) ->> 'status', 'processing',
  'sem Contato que já existe, não há decisão a tomar');
select results_eq(
  $$select r -> 'counts' ->> 'created', r -> 'counts' ->> 'skipped'
    from (select public.process_import_chunk((select id from ids where nome = 'lote_ana')) as r) x$$,
  $$values ('1', '0')$$, 'o Administrador cria o Contato na Conta de outro Vendedor responsável');
reset role;
select results_eq(
  $$select outcome ->> 'account', outcome ->> 'contact' from private.import_rows
    where batch_id = (select id from ids where nome = 'lote_ana') and line_number = 2$$,
  $$values ('skipped', 'created')$$, 'a Conta ficou intacta e só o Contato foi criado');
select is(
  (select name from public.target_accounts where id = (select id from ids where nome = 'alfa')), 'Alfa',
  'o nome da Conta de Beto não mudou');

-- "Substituir dados corrigidos à mão" é escolha do lote.
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
insert into ids select 'lote_troca', batch_id from public.create_import_batch(
  '71000000-0000-0000-0000-000000000001', 'troca.csv', 100);
set local role service_role;
select public.stage_import_rows((select id from ids where nome = 'lote_troca'), $rows$[
  {"line": 1, "cells": ["Empresa","Site"]},
  {"line": 2, "cells": ["Alfa Ltda","alfa.com.br"]}
]$rows$::jsonb);
select public.finish_import_upload((select id from ids where nome = 'lote_troca'), ',', true, '["Empresa","Site"]'::jsonb, '{}'::jsonb);
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
select public.preview_import_batch((select id from ids where nome = 'lote_troca'),
  '{"company_name": 0, "company_url": 1}'::jsonb, true, true);
select public.confirm_import_batch((select id from ids where nome = 'lote_troca'));
select public.process_import_chunk((select id from ids where nome = 'lote_troca'));
reset role;
select results_eq(
  $$select a.name, s.origin from public.target_accounts a
    join private.account_field_sources s on s.target_account_id = a.id and s.field = 'name'
    where a.id = (select id from ids where nome = 'alfa')$$,
  $$values ('Alfa Ltda', 'importacao')$$,
  'com a substituição confirmada, o nome manual é trocado e passa a ter origem de importação');

-- Editar à mão depois da importação volta o campo a manual, e o CSV seguinte o preserva.
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
select public.save_target_account('71000000-0000-0000-0000-000000000001', 'Alfa Brasil', 'alfa.com.br');
reset role;
select is(
  (select origin from private.account_field_sources
   where target_account_id = (select id from ids where nome = 'alfa') and field = 'name'),
  'manual', 'a edição manual depois da importação devolve o campo à origem manual');

-- Um Workspace não enxerga as Contas do outro: a mesma URL no Sul é outra Conta.
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000004', true);
insert into ids select 'lote_sul', batch_id from public.create_import_batch(
  '71000000-0000-0000-0000-000000000002', 'sul.csv', 100);
set local role service_role;
select public.stage_import_rows((select id from ids where nome = 'lote_sul'), $rows$[
  {"line": 1, "cells": ["Empresa","Site"]},
  {"line": 2, "cells": ["Alfa do Sul","alfa.com.br"]}
]$rows$::jsonb);
select public.finish_import_upload((select id from ids where nome = 'lote_sul'), ',', true, '["Empresa","Site"]'::jsonb, '{}'::jsonb);
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000004', true);
select is(
  (public.preview_import_batch((select id from ids where nome = 'lote_sul'),
    '{"company_name": 0, "company_url": 1}'::jsonb)) -> 'preview' ->> 'account_create',
  '1', 'a URL de outro Workspace não corresponde: a prévia do Sul cria a Conta');
select public.confirm_import_batch((select id from ids where nome = 'lote_sul'));
select public.process_import_chunk((select id from ids where nome = 'lote_sul'));
reset role;
select results_eq(
  $$select name, workspace_id from public.target_accounts where canonical_url = 'https://alfa.com.br' order by workspace_id$$,
  $$values ('Alfa Brasil', '71000000-0000-0000-0000-000000000001'::uuid),
           ('Alfa do Sul', '71000000-0000-0000-0000-000000000002'::uuid)$$,
  'cada Workspace tem a própria Conta da mesma URL, sem alterar a do outro');

-- Desistir do lote descarta as linhas e não afeta o Workspace.
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000004', true);
insert into ids select 'lote_desiste', batch_id from public.create_import_batch(
  '71000000-0000-0000-0000-000000000002', 'desiste.csv', 100);
select lives_ok($$select public.cancel_import_batch((select id from ids where nome = 'lote_desiste'))$$,
  'quem importou desiste do lote antes de confirmar');
select is((select public.get_import_batch((select id from ids where nome = 'lote_desiste')) ->> 'status'), 'cancelled',
  'o lote desistido fica cancelado');
select throws_ok($$select public.cancel_import_batch((select id from ids where nome = 'lote_sul'))$$,
  '22023', 'import batch can no longer be cancelled', 'o lote já processado não se cancela');
reset role;

-- Um arquivo que não pôde ser lido falha o lote e descarta o que já tinha guardado.
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000004', true);
insert into ids select 'lote_ruim', batch_id from public.create_import_batch(
  '71000000-0000-0000-0000-000000000002', 'ruim.csv', 100);
set local role service_role;
select public.stage_import_rows((select id from ids where nome = 'lote_ruim'), '[{"line": 1, "cells": ["a"]}]'::jsonb);
select public.fail_import_upload((select id from ids where nome = 'lote_ruim'), 'empty_file');
reset role;
select results_eq(
  $$select status, error_code, (select count(*)::int from private.import_rows where batch_id = b.id)
    from private.import_batches b where id = (select id from ids where nome = 'lote_ruim')$$,
  $$values ('failed', 'empty_file', 0)$$, 'a leitura que falha registra o motivo e não deixa linhas');

-- anon não executa nada disto.
set local role anon;
select throws_ok(
  $$select * from public.create_import_batch('71000000-0000-0000-0000-000000000001', 'x.csv', 10)$$,
  '42501', null, 'anon não abre lote');

select * from finish();
rollback;
