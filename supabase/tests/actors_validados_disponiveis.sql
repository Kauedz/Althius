begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(5);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('66000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values ('aaaaaaaa-6000-0000-0000-000000000001', 'empresa', 'Norte');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('aaaaaaaa-6000-0000-0000-000000000001', '66000000-0000-0000-0000-000000000001', 'admin', true);

-- A3: os 5 actors com execução real registrada (id do run, decisão do Renan de 07/10) nascem disponíveis.
select is(
  (select array_agg(actor_id order by actor_id) from private.signal_actors where state = 'available'),
  array[
    'compass~google-maps-reviews-scraper',
    'harvestapi~linkedin-post-search',
    'harvestapi~linkedin-profile-scraper',
    'harvestapi~linkedin-profile-search',
    'silva95gustavo~linkedin-ad-library-scraper'
  ],
  'os 5 actors validados com id do run nascem disponíveis'
);

-- Os outros 7 (sem id do run registrado) continuam em teste.
select is(
  (select array_agg(actor_id order by actor_id) from private.signal_actors where state = 'testing'),
  array[
    'curious_coder~facebook-ads-library-scraper',
    'curious_coder~linkedin-jobs-scraper',
    'harvestapi~linkedin-company',
    'harvestapi~linkedin-company-employees',
    'harvestapi~linkedin-company-posts',
    'solidcode~ads-transparency-scraper',
    'valig~indeed-jobs-scraper'
  ],
  'os outros 7 seguem em teste'
);

select is((select count(*)::int from private.signal_actors), 12, 'os 12 actors do registro estão cobertos pelos dois estados acima');

select is(
  (select count(*)::int from private.signal_actors where known_price is not null or version is not null), 0,
  'a migration não inventa preço nem versão para nenhum dos 12'
);

-- Só a função de serviço muda o estado; a Conta de usuário não escreve direto no registro.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '66000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.set_signal_actor_state('compass~google-maps-reviews-scraper', 'testing')$$,
  '42501', null, 'a Conta de usuário não reverte um actor já validado'
);
reset role;

select * from finish();
rollback;
