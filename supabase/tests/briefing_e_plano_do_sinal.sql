begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(81);

-- Briefing e Plano do Sinal (agente-de-sinal 01, escopo Contas): quem participa grava o Plano como rascunho do
-- Monitoramento e o anônimo não; o servidor recusa tipo que não está disponível, Conta de outro Workspace ou arquivada,
-- limites estourados e mais de um Sinal; salvar nunca ativa e a versão do Plano sobe a cada gravação; o editor segue
-- gravando como antes (e solta o Plano que ele desfaz); a lista traz os campos novos e os antigos iguais; e o limite de
-- Planos por dia é do Workspace, contado por horários fixos (sem depender da ordem de created_at).
-- Ana: Administradora do Norte. Beto: membro do Norte. Cris: Administradora do Sul. Dani: Administradora do Norte.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('e8000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('e8000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'beto@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('e8000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'cris@sul.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('e8000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'dani@norte.test', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('e8100000-0000-4000-8000-000000000001', 'empresa', 'Norte'),
  ('e8100000-0000-4000-8000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('e8100000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000001', 'admin', true),
  ('e8100000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000002', 'member', true),
  ('e8100000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000004', 'admin', true),
  ('e8100000-0000-4000-8000-000000000002', 'e8000000-0000-4000-8000-000000000003', 'admin', true);

-- 501 Contas no Norte (a 502ª está arquivada) e uma no Sul.
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by)
select ('e8200000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'e8100000-0000-4000-8000-000000000001',
       'Conta ' || i, 'https://conta' || i || '.test', 'conta' || i || '.test', 'e8000000-0000-4000-8000-000000000001'
from generate_series(1, 502) i;
update public.target_accounts set archived_at = now() where id = 'e8200000-0000-4000-8000-000000000502';
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by) values
  ('e8200000-0000-4000-8000-000000009101', 'e8100000-0000-4000-8000-000000000002', 'Conta do Sul', 'https://sul.test', 'sul.test',
   'e8000000-0000-4000-8000-000000000003');

-- Só dois Sinais estão disponíveis: Abertura de vagas e Anunciando na Meta. Nova liderança está em teste, e
-- Anunciando no LinkedIn está fora.
update private.signal_actors set state = 'testing';
select public.set_signal_actor_state(a.actor_id, 'available', 'v1')
from private.signal_actors a where a.signal_type in ('vaga_linkedin', 'anuncio_meta');
select public.set_signal_actor_state(a.actor_id, 'out', 'v1') from private.signal_actors a where a.signal_type = 'anuncio_linkedin';

create temporary table r (k text primary key, id uuid) on commit drop;
grant all on r to authenticated;
create temporary table ids (k text primary key, v jsonb) on commit drop;
grant select on ids to authenticated;
insert into ids values
  ('duas', '["e8200000-0000-4000-8000-000000000001","e8200000-0000-4000-8000-000000000002"]'),
  ('quinhentas', (select jsonb_agg('e8200000-0000-4000-8000-' || lpad(i::text, 12, '0')) from generate_series(1, 500) i)),
  ('quinhentas_e_uma', (select jsonb_agg('e8200000-0000-4000-8000-' || lpad(i::text, 12, '0')) from generate_series(1, 501) i)),
  ('do_sul', '["e8200000-0000-4000-8000-000000009101"]'),
  ('arquivada', '["e8200000-0000-4000-8000-000000000001","e8200000-0000-4000-8000-000000000502"]'),
  ('repetida', '["e8200000-0000-4000-8000-000000000001","E8200000-0000-4000-8000-000000000001"]'),
  ('inexistente', '["e8200000-0000-4000-8000-000000000999"]');
-- O Plano de base: Abertura de vagas em duas Contas do Norte. Os testes mudam uma chave de cada vez com `||`.
create temporary table base (p jsonb) on commit drop;
grant select on base to authenticated;
insert into base values (jsonb_build_object(
  'versao', 1, 'origem', 'briefing',
  'escopo', jsonb_build_object('tipo', 'contas', 'contaIds', (select v from ids where k = 'duas')),
  'sinais', jsonb_build_array(jsonb_build_object('tipo', 'vaga_linkedin',
    'criterios', '{"funcoes":["RevOps e GTM","SDR"],"senioridade":"Liderança","localizacao":["Brasil"],"periodo":"Últimos 30 dias","palavras":"lakehouse, migração"}'::jsonb)),
  'explicacao', 'Acompanha vagas de RevOps e SDR nas duas Contas escolhidas.',
  'maxEmpresasPorRodada', 50));

-- 0. Os limites e as chaves do banco.
select is(
  (select array[private.signal_plan_limit('brief_max'), private.signal_plan_limit('explanation_max'), private.signal_plan_limit('accounts_max'),
    private.signal_plan_limit('per_round_min'), private.signal_plan_limit('per_round_max'), private.signal_plan_limit('signals_per_plan'),
    private.signal_plan_limit('plans_per_day')]),
  array[1000, 600, 500, 1, 100, 1, 20], 'os limites do Plano (decididos pelo Kauê em 24/10/2026) estão num lugar só do banco');
select is(private.signal_plan_limit('per_round_default'), 25, 'e o padrão de empresas por Rodada é 25');
select is(private.signal_plan_criteria_keys('anuncio_meta'), array['localizacao', 'periodo', 'palavras'],
  'cada tipo diz os campos que o adaptador lê');
select is(private.signal_plan_criteria_keys('sem_resposta'), null, 'um tipo sem adaptador de Conta não tem campos');

-- 1. Quem participa grava o Plano; o Monitoramento nasce em rascunho e a versão é 1.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'e8000000-0000-4000-8000-000000000001', true);

insert into r select 'ana', public.save_signal_plan('e8100000-0000-4000-8000-000000000001', '  Vagas de RevOps  ',
  '  Quero saber quando abrirem vaga de RevOps.  ', (select p from base));
select is((select name || '|' || state || '|' || signal_type || '|' || plan_version || '|' || plan_origin
  from public.list_signal_monitors('e8100000-0000-4000-8000-000000000001') where id = (select id from r where k = 'ana')),
  'Vagas de RevOps|rascunho|vaga_linkedin|1|briefing', 'o Plano vira um Monitoramento em rascunho, versão 1, origem briefing');
select is((select brief from public.list_signal_monitors('e8100000-0000-4000-8000-000000000001') where id = (select id from r where k = 'ana')),
  'Quero saber quando abrirem vaga de RevOps.', 'o Briefing é guardado sem espaços nas pontas');
select is((select audience from public.list_signal_monitors('e8100000-0000-4000-8000-000000000001') where id = (select id from r where k = 'ana')),
  jsonb_build_object('accountIds', (select v from ids where k = 'duas')), 'o público são as Contas escolhidas');
select is((select criteria from public.list_signal_monitors('e8100000-0000-4000-8000-000000000001') where id = (select id from r where k = 'ana')),
  (select p -> 'sinais' -> 0 -> 'criterios' from base), 'os critérios do Monitoramento são os do Plano');
select is((select plan from public.list_signal_monitors('e8100000-0000-4000-8000-000000000001') where id = (select id from r where k = 'ana')),
  (select p from base), 'o Plano volta inteiro na lista');
select is((select every_hours from public.list_signal_monitors('e8100000-0000-4000-8000-000000000001') where id = (select id from r where k = 'ana')),
  24, 'a cadência segue a de hoje, a cada 24 horas');

-- 2. Nada é ativado: o rascunho não tem próxima rodada e nenhuma rodada existe.
reset role;
select is((select next_run_at is null and last_run_at is null from private.signal_monitors where id = (select id from r where k = 'ana')), true,
  'salvar o Plano não agenda rodada nenhuma');
select is((select count(*)::int from private.signal_monitor_runs where monitor_id = (select id from r where k = 'ana')), 0,
  'salvar o Plano não roda nada');
set local role authenticated;

-- 3. Anônimo não salva nem abre pedido; quem não participa do Workspace também não.
reset role;
set local role anon;
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Anon', null, (select p from base))$$,
  '42501', null, 'anônimo não salva o Plano');
select throws_ok($$select public.begin_signal_plan_request('e8100000-0000-4000-8000-000000000001')$$, '42501', null,
  'anônimo não abre pedido de Plano');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e8000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Cris', null, (select p from base))$$,
  '42501', 'active workspace membership required', 'quem não participa do Workspace não salva o Plano');
select throws_ok($$select public.begin_signal_plan_request('e8100000-0000-4000-8000-000000000001')$$, '42501',
  'active workspace membership required', 'quem não participa do Workspace não abre pedido de Plano');
select throws_ok($$select * from public.list_signal_monitors('e8100000-0000-4000-8000-000000000001')$$, '42501',
  'active workspace membership required', 'nem lê os Monitoramentos do outro Workspace');
select set_config('request.jwt.claim.sub', 'e8000000-0000-4000-8000-000000000001', true);

-- 4. O tipo precisa estar disponível: em teste, fora, inexistente, de cascata ou interno são recusados.
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Em teste', null,
    (select p from base) || '{"sinais":[{"tipo":"nova_lideranca","criterios":{}}]}')$$,
  '55000', 'signal type is not available', 'tipo em teste é recusado');
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Fora', null,
    (select p from base) || '{"sinais":[{"tipo":"anuncio_linkedin","criterios":{}}]}')$$,
  '55000', 'signal type is not available', 'tipo fora do ar é recusado');
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Inexistente', null,
    (select p from base) || '{"sinais":[{"tipo":"tipo_que_nao_existe","criterios":{}}]}')$$,
  '55000', 'signal type is not available', 'tipo inexistente é recusado');
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Cascata', null,
    (select p from base) || '{"sinais":[{"tipo":"vaga_comex","criterios":{}}]}')$$,
  '55000', 'signal type is not available', 'tipo de cascata (sem actor de Conta) é recusado');
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Interno', null,
    (select p from base) || '{"sinais":[{"tipo":"sem_resposta","criterios":{"prazo":"45"}}]}')$$,
  '55000', 'signal type is not available', 'Sinal interno é recusado');
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Mercado', null,
    (select p from base) || '{"sinais":[{"tipo":"vaga_mercado","criterios":{}}]}')$$,
  '55000', 'signal type is not available', 'vaga_mercado (mercado, em teste) é recusado');
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Sem fonte', null,
    (select p from base) || '{"sinais":[{"tipo":"area_no_car","criterios":{}}]}')$$,
  '55000', 'signal type is not available', 'tipo sem fonte (cascata sem_fonte) é recusado');
select lives_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Meta', null,
    (select p from base) || '{"sinais":[{"tipo":"anuncio_meta","criterios":{"localizacao":["Brasil"],"periodo":"Últimos 14 dias","palavras":"black friday"}}]}')$$,
  'um tipo disponível com os campos dele é aceito');

-- 5. As Contas: do Workspace, operáveis, de 1 a 50, sem repetir.
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Do Sul', null,
    (select p from base) || jsonb_build_object('escopo', jsonb_build_object('tipo', 'contas', 'contaIds', (select v from ids where k = 'do_sul'))))$$,
  '22023', 'invalid signal plan', 'Conta de outro Workspace é recusada');
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Inexistente', null,
    (select p from base) || jsonb_build_object('escopo', jsonb_build_object('tipo', 'contas', 'contaIds', (select v from ids where k = 'inexistente'))))$$,
  '22023', 'invalid signal plan', 'Conta que não existe é recusada');
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Arquivada', null,
    (select p from base) || jsonb_build_object('escopo', jsonb_build_object('tipo', 'contas', 'contaIds', (select v from ids where k = 'arquivada'))))$$,
  '55006', 'the target account is archived', 'Conta arquivada é recusada');
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Repetida', null,
    (select p from base) || jsonb_build_object('escopo', jsonb_build_object('tipo', 'contas', 'contaIds', (select v from ids where k = 'repetida'))))$$,
  '22023', 'invalid signal plan', 'Conta repetida é recusada');
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Quinhentas e uma', null,
    (select p from base) || jsonb_build_object('escopo', jsonb_build_object('tipo', 'contas', 'contaIds', (select v from ids where k = 'quinhentas_e_uma'))))$$,
  '22023', 'invalid signal plan', 'mais de 500 Contas é recusado');
select lives_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Quinhentas', null,
    (select p from base) || jsonb_build_object('escopo', jsonb_build_object('tipo', 'contas', 'contaIds', (select v from ids where k = 'quinhentas'))))$$,
  'exatamente 500 Contas é aceito');
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Nenhuma', null,
    (select p from base) || '{"escopo":{"tipo":"contas","contaIds":[]}}')$$,
  '22023', 'invalid signal plan', 'Plano sem Conta é recusado');
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Mercado', null,
    (select p from base) || '{"escopo":{"tipo":"mercado"}}')$$,
  '22023', 'invalid signal plan', 'o escopo mercado está no esquema, mas não é oferecido');

-- 6. Um Sinal só por Plano (DECISÃO PENDENTE 8).
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Dois', null,
    (select p from base) || '{"sinais":[{"tipo":"vaga_linkedin","criterios":{}},{"tipo":"anuncio_meta","criterios":{}}]}')$$,
  '22023', 'invalid signal plan', 'mais de 1 item em sinais é recusado');
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Zero', null,
    (select p from base) || '{"sinais":[]}')$$,
  '22023', 'invalid signal plan', 'nenhum item em sinais é recusado');

-- 7. Formato e limites.
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Versão', null, (select p from base) || '{"versao":2}')$$,
  '22023', 'invalid signal plan', 'versão desconhecida é recusada');
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Origem', null, (select p from base) || '{"origem":"ia"}')$$,
  '22023', 'invalid signal plan', 'origem desconhecida é recusada');
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Chave', null, (select p from base) || '{"ativar":true}')$$,
  '22023', 'invalid signal plan', 'chave desconhecida no Plano é recusada');
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Explicação', null,
    (select p from base) || jsonb_build_object('explicacao', repeat('a', 601)))$$,
  '22023', 'invalid signal plan', 'explicação com mais de 600 caracteres é recusada');
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Zero empresas', null,
    (select p from base) || '{"maxEmpresasPorRodada":0}')$$,
  '22023', 'invalid signal plan', 'zero empresas por Rodada é recusado');
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Cento e uma', null,
    (select p from base) || '{"maxEmpresasPorRodada":101}')$$,
  '22023', 'invalid signal plan', 'mais de 100 empresas por Rodada é recusado');
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Fração', null,
    (select p from base) || '{"maxEmpresasPorRodada":2.5}')$$,
  '22023', 'invalid signal plan', 'empresas por Rodada fracionadas são recusadas');
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Briefing longo', repeat('b', 1001), (select p from base))$$,
  '22023', 'invalid signal plan', 'Briefing com mais de 1.000 caracteres é recusado');
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', '   ', null, (select p from base))$$,
  '22023', 'invalid monitor', 'o nome passa pelas regras do editor (não pode ser vazio)');
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Modelo sem origem', null,
    (select p from base) || '{"modeloId":"revops-1"}')$$,
  '22023', 'invalid signal plan', 'o id do Modelo só vale com a origem modelo');

-- 8. Os critérios: só os campos do tipo, dentro dos limites da tela.
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Campo alheio', null,
    (select p from base) || '{"sinais":[{"tipo":"vaga_linkedin","criterios":{"nota":"Até 2 estrelas"}}]}')$$,
  '22023', 'invalid signal plan', 'campo que o adaptador do tipo não lê é recusado');
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Período', null,
    (select p from base) || '{"sinais":[{"tipo":"vaga_linkedin","criterios":{"periodo":"Últimos 3 dias"}}]}')$$,
  '22023', 'invalid signal plan', 'período fora das opções é recusado');
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'País', null,
    (select p from base) || '{"sinais":[{"tipo":"vaga_linkedin","criterios":{"localizacao":["Atlântida"]}}]}')$$,
  '22023', 'invalid signal plan', 'país fora da lista é recusado');
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Onze cargos', null,
    (select p from base) || '{"sinais":[{"tipo":"vaga_linkedin","criterios":{"funcoes":["C1","C2","C3","C4","C5","C6","C7","C8","C9","C10","C11"]}}]}')$$,
  '22023', 'invalid signal plan', 'mais de 10 cargos Custom é recusado');
select lives_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Dez mais sugestões', null,
    (select p from base) || '{"sinais":[{"tipo":"vaga_linkedin","criterios":{"funcoes":["C1","C2","C3","C4","C5","C6","C7","C8","C9","C10","Agrônomo","Finanças"]}}]}')$$,
  'as sugestões da tela não contam no limite dos 10 cargos Custom');
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Cargo longo', null,
    (select p from base) || jsonb_build_object('sinais', jsonb_build_array(jsonb_build_object('tipo', 'vaga_linkedin', 'criterios', jsonb_build_object('funcoes', jsonb_build_array(repeat('x', 61)))))))$$,
  '22023', 'invalid signal plan', 'cargo com mais de 60 caracteres é recusado');
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Cargo repetido', null,
    (select p from base) || '{"sinais":[{"tipo":"vaga_linkedin","criterios":{"funcoes":["Agrônomo","agronomo"]}}]}')$$,
  '22023', 'invalid signal plan', 'cargo repetido (sem acento e sem caixa) é recusado');
select throws_ok(
  $$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Palavras', null,
    (select p from base) || jsonb_build_object('sinais', jsonb_build_array(jsonb_build_object('tipo', 'vaga_linkedin', 'criterios', jsonb_build_object('palavras', repeat('p', 201))))))$$,
  '22023', 'invalid signal plan', 'palavras com mais de 200 caracteres são recusadas');

-- 9. Salvar de novo sobe a versão e nunca ativa, nem muda o estado que o Monitoramento já tem.
select is(public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Vagas de RevOps v2', 'Briefing novo',
  (select p from base) || '{"explicacao":"Segunda versão."}', (select id from r where k = 'ana')), (select id from r where k = 'ana'),
  'salvar de novo com o id atualiza o mesmo Monitoramento');
select is((select name || '|' || state || '|' || plan_version || '|' || brief
  from public.list_signal_monitors('e8100000-0000-4000-8000-000000000001') where id = (select id from r where k = 'ana')),
  'Vagas de RevOps v2|rascunho|2|Briefing novo', 'a versão do Plano sobe a cada gravação');
select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Vagas de RevOps v3', null,
  (select p from base) || '{"origem":"formulario"}', (select id from r where k = 'ana'));
select is((select plan_version || '|' || plan_origin || '|' || coalesce(brief, 'sem briefing')
  from public.list_signal_monitors('e8100000-0000-4000-8000-000000000001') where id = (select id from r where k = 'ana')),
  '3|formulario|sem briefing', 'a terceira gravação sobe para 3, guarda a origem e solta o Briefing vazio');

insert into r select 'ativo', public.save_signal_monitor('e8100000-0000-4000-8000-000000000001', null, 'vaga_linkedin',
  'Já ativo', 'ativo', jsonb_build_object('accountIds', (select v from ids where k = 'duas')), '{"funcoes":["SDR"]}', 24);
select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Já ativo, com Plano', 'Briefing', (select p from base),
  (select id from r where k = 'ativo'));
select is((select state || '|' || plan_version from public.list_signal_monitors('e8100000-0000-4000-8000-000000000001')
  where id = (select id from r where k = 'ativo')), 'ativo|1', 'o Monitoramento ativo continua ativo, com o Plano na versão 1');

-- 10. Quem muda o Monitoramento: o criador e o Administrador, não outro membro.
select set_config('request.jwt.claim.sub', 'e8000000-0000-4000-8000-000000000002', true);
select throws_ok(
  format($$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Do Beto', null, (select p from base), %L)$$,
    (select id from r where k = 'ana')),
  '42501', 'only the creator or an administrator can change this monitor', 'outro membro não muda o Plano de quem criou');
insert into r select 'beto', public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Do Beto', null, (select p from base));
select ok((select id from r where k = 'beto') is not null, 'qualquer participante ativo cria o seu');
select set_config('request.jwt.claim.sub', 'e8000000-0000-4000-8000-000000000004', true);
select lives_ok(
  format($$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Ajustado pela Dani', null, (select p from base), %L)$$,
    (select id from r where k = 'beto')),
  'um Administrador muda o Plano de outro participante');
select throws_ok(
  format($$select public.save_signal_plan('e8100000-0000-4000-8000-000000000001', 'Não existe', null, (select p from base), %L)$$,
    'e8300000-0000-4000-8000-000000000999'),
  'P0002', 'monitor not found', 'Monitoramento que não existe não é criado por aqui');
select set_config('request.jwt.claim.sub', 'e8000000-0000-4000-8000-000000000001', true);

-- 11. O editor segue como antes: o Monitoramento antigo não tem Plano, e mudar os critérios por lá solta o Plano.
insert into r select 'antigo', public.save_signal_monitor('e8100000-0000-4000-8000-000000000001', null, 'anuncio_meta',
  'Anúncios, pelo editor', 'rascunho', jsonb_build_object('accountIds', (select v from ids where k = 'duas')),
  '{"localizacao":["Brasil"],"periodo":"Últimos 30 dias"}', 24);
select is((select concat_ws('|', name, state, signal_type, every_hours, brief is null, plan is null, plan_version, plan_origin is null,
  last_error is null, last_run is null)
  from public.list_signal_monitors('e8100000-0000-4000-8000-000000000001') where id = (select id from r where k = 'antigo')),
  'Anúncios, pelo editor|rascunho|anuncio_meta|24|t|t|0|t|t|t', 'o Monitoramento do editor aparece como antes, sem Plano');
select public.save_signal_monitor('e8100000-0000-4000-8000-000000000001', (select id from r where k = 'ana'), 'vaga_linkedin',
  'Mesmo nome', 'rascunho', (select audience from public.list_signal_monitors('e8100000-0000-4000-8000-000000000001') where id = (select id from r where k = 'ana')),
  (select criteria from public.list_signal_monitors('e8100000-0000-4000-8000-000000000001') where id = (select id from r where k = 'ana')), 24);
select is((select plan is not null and plan_version = 3 from public.list_signal_monitors('e8100000-0000-4000-8000-000000000001')
  where id = (select id from r where k = 'ana')), true, 'regravar no editor sem mudar tipo, público e critérios mantém o Plano');
select public.save_signal_monitor('e8100000-0000-4000-8000-000000000001', (select id from r where k = 'ana'), 'vaga_linkedin',
  'Critério mudado', 'rascunho', (select audience from public.list_signal_monitors('e8100000-0000-4000-8000-000000000001') where id = (select id from r where k = 'ana')),
  '{"funcoes":["Finanças"]}', 24);
select is((select concat_ws('|', plan is null, plan_origin is null, plan_version, brief is null)
  from public.list_signal_monitors('e8100000-0000-4000-8000-000000000001') where id = (select id from r where k = 'ana')),
  't|t|3|t', 'mudar os critérios no editor solta o Plano (a versão fica; o Briefing já estava vazio)');
select is((select concat_ws('|', plan is null, brief)
  from public.list_signal_monitors('e8100000-0000-4000-8000-000000000001') where id = (select id from r where k = 'ativo')),
  'f|Briefing', 'o Monitoramento com Plano que o editor não mexeu segue com Plano e Briefing');

-- 12. A lista: os campos antigos na mesma ordem e os quatro novos no fim. A Agenda do Sinal (20261118120000) acrescentou
-- schedule e next_run_at depois deles, e o Preço por rodada (20261119120000) daily_credit_cap, consecutive_skips e paused_reason;
-- a ordem de tudo o que veio antes não mudou.
select is(pg_get_function_result('public.list_signal_monitors(uuid)'::regprocedure),
  'TABLE(id uuid, signal_type text, name text, state text, audience jsonb, criteria jsonb, every_hours integer, created_by uuid, last_run_at timestamp with time zone, last_error text, created_at timestamp with time zone, last_run jsonb, brief text, plan jsonb, plan_version integer, plan_origin text, schedule jsonb, next_run_at timestamp with time zone, daily_credit_cap integer, consecutive_skips integer, paused_reason text)',
  'list_signal_monitors mantém as colunas de antes, acrescenta brief, plan, plan_version e plan_origin no fim e, depois, schedule, next_run_at, daily_credit_cap, consecutive_skips e paused_reason');

-- 13. O limite de Planos por dia (DECISÃO PENDENTE 13), contado por horários fixos.
reset role;
-- Norte: 19 pedidos dentro das últimas 24 horas (alguns falharam, outros não terminaram) e 5 antigos, que não contam.
insert into private.signal_plan_requests (workspace_id, requested_by, outcome, created_at)
select 'e8100000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000001',
       (array['ia', 'regra', 'falhou', null])[1 + i % 4], now() - make_interval(mins => 30 + i * 60)
from generate_series(0, 18) i;
insert into private.signal_plan_requests (workspace_id, requested_by, outcome, created_at)
select 'e8100000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000001', 'ia', now() - make_interval(hours => 25 + i)
from generate_series(0, 4) i;
-- Sul: só pedidos de ontem.
insert into private.signal_plan_requests (workspace_id, requested_by, outcome, created_at)
select 'e8100000-0000-4000-8000-000000000002', 'e8000000-0000-4000-8000-000000000003', 'ia', now() - make_interval(hours => 25 + i)
from generate_series(0, 29) i;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e8000000-0000-4000-8000-000000000001', true);

insert into r select 'pedido', (public.begin_signal_plan_request('e8100000-0000-4000-8000-000000000001') ->> 'requestId')::uuid;
select ok((select id from r where k = 'pedido') is not null, 'o 20º pedido do dia ainda passa');
select throws_ok($$select public.begin_signal_plan_request('e8100000-0000-4000-8000-000000000001')$$, '54000',
  'signal plan daily limit reached', 'o 21º pedido do dia é recusado');
select throws_ok($$select public.begin_signal_plan_request('e8100000-0000-4000-8000-000000000001')$$, '54000', null,
  'e continua recusado enquanto os 20 estão dentro das 24 horas');
select set_config('request.jwt.claim.sub', 'e8000000-0000-4000-8000-000000000003', true);
select lives_ok($$select public.begin_signal_plan_request('e8100000-0000-4000-8000-000000000002')$$,
  'o limite é por Workspace: o Sul, com pedidos só de ontem, passa');
reset role;
select is((select count(*)::int from private.signal_plan_requests where workspace_id = 'e8100000-0000-4000-8000-000000000002'
  and created_at > now() - interval '24 hours'), 1, 'o pedido do Sul ficou registrado');
-- Um pedido sai da conta quando completa 24 horas: o mais velho dentro da janela passa a ser de 25 horas.
update private.signal_plan_requests set created_at = now() - interval '25 hours'
where id = (select id from private.signal_plan_requests where workspace_id = 'e8100000-0000-4000-8000-000000000001'
  and created_at > now() - interval '24 hours' order by created_at limit 1);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e8000000-0000-4000-8000-000000000001', true);
select lives_ok($$select public.begin_signal_plan_request('e8100000-0000-4000-8000-000000000001')$$,
  'passadas 24 horas, o pedido deixa de contar e abre uma vaga');

-- 14. O catálogo que o pedido devolve: só os tipos disponíveis com campos conhecidos.
reset role;
delete from private.signal_plan_requests where workspace_id = 'e8100000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e8000000-0000-4000-8000-000000000003', true);
select is(public.begin_signal_plan_request('e8100000-0000-4000-8000-000000000002') -> 'tipos', '["anuncio_meta", "vaga_linkedin"]'::jsonb,
  'o pedido devolve os tipos que o Plano aceita (os disponíveis), em ordem');
reset role;
-- Um tipo disponível sem campos conhecidos não entra: simulado com um actor novo no registro.
insert into private.signal_actors (actor_id, signal_type, state) values ('teste~sem-adaptador', 'tipo_de_teste', 'available');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e8000000-0000-4000-8000-000000000003', true);
select is(public.begin_signal_plan_request('e8100000-0000-4000-8000-000000000002') -> 'tipos', '["anuncio_meta", "vaga_linkedin"]'::jsonb,
  'um actor disponível sem campos de critério conhecidos não entra no Plano');

-- 15. Como o Plano saiu: só quem abriu o pedido registra, uma vez, com um resultado conhecido.
select set_config('request.jwt.claim.sub', 'e8000000-0000-4000-8000-000000000001', true);
select lives_ok(
  format($$select public.finish_signal_plan_request('e8100000-0000-4000-8000-000000000001', %L, 'regra')$$, (select id from r where k = 'pedido')),
  'quem abriu o pedido registra como o Plano saiu');
select throws_ok(
  format($$select public.finish_signal_plan_request('e8100000-0000-4000-8000-000000000001', %L, 'ia')$$, (select id from r where k = 'pedido')),
  'P0002', 'signal plan request not found', 'o resultado não é regravado');
select throws_ok(
  format($$select public.finish_signal_plan_request('e8100000-0000-4000-8000-000000000001', %L, 'gratis')$$, (select id from r where k = 'pedido')),
  '22023', 'invalid signal plan', 'resultado desconhecido é recusado');
select set_config('request.jwt.claim.sub', 'e8000000-0000-4000-8000-000000000004', true);
select throws_ok(
  format($$select public.finish_signal_plan_request('e8100000-0000-4000-8000-000000000001', %L, 'ia')$$, (select id from r where k = 'pedido')),
  'P0002', 'signal plan request not found', 'outra pessoa não registra o resultado do pedido de quem abriu');

-- 16. A tabela e as funções internas não estão abertas ao navegador.
select throws_ok($$select * from private.signal_plan_requests$$, '42501', null, 'a tabela de pedidos não tem acesso direto');
select throws_ok($$select private.validate_signal_plan('e8100000-0000-4000-8000-000000000001', '{}')$$, '42501', null,
  'a validação do Plano não é chamada direto pelo navegador');
reset role;
select is((select relrowsecurity from pg_class where oid = 'private.signal_plan_requests'::regclass), true,
  'a tabela de pedidos tem RLS ligado');

select * from finish();
rollback;
