-- Limpeza administrativa das Sequências órfãs (CRM-17). NÃO é migration e NÃO roda sozinha: uma pessoa a executa na
-- pré-produção (ycbdilsmydvzezhlymty, ADR-0013), depois de revisar o que ela apagaria.
--
-- O que é uma órfã: uma Sequência (ou responsabilidade) cujo identificador de Conta-alvo é um texto solto, como os
-- `teste-real-*` que o `npm run teste:real` criava antes do CRM-17, ou um UUID sem Conta-alvo no mesmo Workspace. A
-- migration 20260929130000_sequencias_nas_contas_reais.sql deixou essas linhas como estavam e só passou a recusar
-- linhas novas assim; a chave estrangeira para target_accounts ficou NOT VALID por causa delas.
--
-- Como usar, no SQL Editor do Supabase (ou pelo execute_sql), uma parte de cada vez:
--   Parte 1  só lê. Mostra as órfãs, o que depende delas e o que esta limpeza NÃO apaga. Confira a lista.
--   Parte 2  apaga, numa transação que termina em ROLLBACK. Rode assim primeiro: ela imprime o que apagaria. Para
--            valer, troque o ROLLBACK final por COMMIT e rode de novo.
--   Parte 3  valida as chaves estrangeiras. Só passa quando não sobrou órfã. Depois dela, uma migration futura pode
--            trocar as colunas de texto por uuid.
--
-- O que a Parte 2 apaga: as Sequências com target_account_id `teste-real-*` e sem Conta-alvo real, com o documento
-- privado, as autorizações, os Envios e as respostas recebidas delas, as responsabilidades `teste-real-*` sem Conta e
-- os Contatos legados (private.target_contacts_canais02) pendurados nelas. Recusa-se a rodar se alguma dessas
-- Sequências tiver Envio que saiu ou pode ter saído (enviado, em voo ou incerto): isso seria histórico real.
-- O que ela NÃO apaga: órfãs com outro identificador (a Parte 1 as lista: decida uma a uma) e a auditoria de
-- atribuições (private.account_assignment_events), que é histórico sem chave estrangeira.
--
-- Nada aqui altera Conta-alvo, Contato, Participação, usuário (auth.users) ou Conta remetente.

-- ============================================================================================================
-- Parte 1: só lê.
-- ============================================================================================================

-- 1a. As Sequências órfãs, com o titular e o que depende de cada uma.
select s.id as sequencia, s.workspace_id, s.target_account_id, s.status, s.created_at,
  (select u.email from auth.users u where u.id = s.owner_user_id) as titular,
  s.target_account_id like 'teste-real-%' as sera_apagada_pela_parte_2,
  (select count(*) from private.sequence_documents d where d.sequence_id = s.id) as documentos,
  (select count(*) from private.sequence_authorizations a where a.sequence_id = s.id) as autorizacoes,
  (select count(*) from private.sequence_step_sends e where e.sequence_id = s.id) as envios,
  (select count(*) from private.sequence_step_sends e
    where e.sequence_id = s.id and e.status in ('sending', 'sent', 'uncertain')) as envios_que_sairam,
  (select count(*) from private.received_emails r where r.sequence_id = s.id) as respostas_recebidas
from public.sequences s
where not exists (
  select 1 from public.target_accounts a where a.id::text = s.target_account_id and a.workspace_id = s.workspace_id)
order by s.created_at;

-- 1b. As responsabilidades órfãs, com quantas Sequências e Contatos legados dependem de cada uma.
select r.workspace_id, r.target_account_id, r.created_at,
  (select u.email from auth.users u where u.id = r.owner_user_id) as responsavel,
  r.target_account_id like 'teste-real-%' as sera_apagada_pela_parte_2,
  (select count(*) from public.sequences s
    where s.workspace_id = r.workspace_id and s.target_account_id = r.target_account_id) as sequencias,
  (select count(*) from private.target_contacts_canais02 c
    where c.workspace_id = r.workspace_id and c.target_account_id = r.target_account_id) as contatos_legados
from public.sales_responsibilities r
where not exists (
  select 1 from public.target_accounts a where a.id::text = r.target_account_id and a.workspace_id = r.workspace_id)
order by r.created_at;

-- 1c. O que a Parte 2 deixaria para trás e ainda impediria a Parte 3: órfãs com outro identificador. Deve vir vazio.
select 'sequencia' as tipo, s.workspace_id, s.target_account_id
from public.sequences s
where s.target_account_id not like 'teste-real-%'
  and not exists (
    select 1 from public.target_accounts a where a.id::text = s.target_account_id and a.workspace_id = s.workspace_id)
union all
select 'responsabilidade', r.workspace_id, r.target_account_id
from public.sales_responsibilities r
where r.target_account_id not like 'teste-real-%'
  and not exists (
    select 1 from public.target_accounts a where a.id::text = r.target_account_id and a.workspace_id = r.workspace_id);

-- 1d. Só para saber: Sequências em andamento cujo titular já não é o responsável da Conta. Depois do CRM-17 o gatilho as
-- encerra na Transferência; uma linha aqui vem de antes e é encerrada quando o responsável atual cria a Sequência dele.
select s.id as sequencia, s.workspace_id, s.target_account_id, s.owner_user_id, r.owner_user_id as responsavel_atual
from public.sequences s
join public.sales_responsibilities r
  on r.workspace_id = s.workspace_id and r.target_account_id = s.target_account_id
where s.status <> 'encerrada' and s.owner_user_id <> r.owner_user_id;

-- ============================================================================================================
-- Parte 2: apaga. Termina em ROLLBACK: troque pelo COMMIT do fim só depois de conferir o que foi impresso.
-- ============================================================================================================
begin;

-- Só as Sequências `teste-real-*` sem Conta-alvo real.
create temporary table orfas_a_apagar on commit drop as
select s.id, s.workspace_id, s.target_account_id
from public.sequences s
where s.target_account_id like 'teste-real-%'
  and not exists (
    select 1 from public.target_accounts a where a.id::text = s.target_account_id and a.workspace_id = s.workspace_id);

-- Envio que saiu ou pode ter saído é histórico de e-mail real: não se apaga por aqui.
do $$
begin
  if exists (
    select 1 from private.sequence_step_sends e
    join orfas_a_apagar o on o.id = e.sequence_id
    where e.status in ('sending', 'sent', 'uncertain')
  ) then
    raise exception 'uma Sequência órfã tem Envio que saiu ou pode ter saído; revise antes de apagar';
  end if;
end
$$;

-- A responsabilidade é permanente e a Sequência não se apaga pelo cliente: só esta operação administrativa, com os
-- dois gatilhos desligados dentro da transação (DDL é transacional: o ROLLBACK os devolve).
alter table public.sequences disable trigger sequences_no_delete;
alter table public.sales_responsibilities disable trigger sales_responsibilities_immutable;

-- Dos dependentes para a Sequência, na ordem das chaves estrangeiras.
delete from private.unipile_email_events e
using private.sequence_step_sends s, orfas_a_apagar o
where e.send_id = s.id and s.sequence_id = o.id;
delete from private.received_emails r using orfas_a_apagar o where r.sequence_id = o.id;
delete from private.sequence_step_sends s using orfas_a_apagar o where s.sequence_id = o.id;
delete from private.sequence_authorizations a using orfas_a_apagar o where a.sequence_id = o.id;
delete from private.sequence_documents d using orfas_a_apagar o where d.sequence_id = o.id;
delete from public.sequences s using orfas_a_apagar o where s.id = o.id;

-- As responsabilidades `teste-real-*` sem Conta e sem Sequência, e os Contatos legados delas.
delete from private.target_contacts_canais02 c
where c.target_account_id like 'teste-real-%'
  and not exists (
    select 1 from public.target_accounts a where a.id::text = c.target_account_id and a.workspace_id = c.workspace_id)
  and not exists (
    select 1 from public.sequences s where s.workspace_id = c.workspace_id and s.target_account_id = c.target_account_id);
delete from public.sales_responsibilities r
where r.target_account_id like 'teste-real-%'
  and not exists (
    select 1 from public.target_accounts a where a.id::text = r.target_account_id and a.workspace_id = r.workspace_id)
  and not exists (
    select 1 from public.sequences s where s.workspace_id = r.workspace_id and s.target_account_id = r.target_account_id);

alter table public.sequences enable trigger sequences_no_delete;
alter table public.sales_responsibilities enable trigger sales_responsibilities_immutable;

-- O que sobrou de órfã (deve ser zero nas duas colunas antes da Parte 3).
select
  (select count(*) from public.sequences s
    where not exists (select 1 from public.target_accounts a
      where a.id::text = s.target_account_id and a.workspace_id = s.workspace_id)) as sequencias_orfas_restantes,
  (select count(*) from public.sales_responsibilities r
    where not exists (select 1 from public.target_accounts a
      where a.id::text = r.target_account_id and a.workspace_id = r.workspace_id)) as responsabilidades_orfas_restantes;

rollback;  -- Troque por "commit;" para apagar de verdade, depois de conferir a Parte 1 e o resultado acima.

-- ============================================================================================================
-- Parte 3: valida as chaves estrangeiras (só depois do COMMIT da Parte 2, sem órfã restante).
-- ============================================================================================================
-- alter table public.sales_responsibilities validate constraint sales_responsibilities_target_account_fk;
-- alter table public.sequences validate constraint sequences_target_account_fk;
