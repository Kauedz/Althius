begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(13);

-- A leitura da conexão Unipile ativa pelas Edge Functions (canais-16, ADR-0024): endereço e versão da linha ativa, mais a
-- chave e o segredo do webhook lidos do Vault pelos NOMES que a linha guarda. Só o service_role chama.
--
-- O Vault real só existe no Supabase. Onde ele não existe (o Postgres local do pgTAP), o teste cria uma `vault.decrypted_secrets`
-- de mentira, só com `name` e `decrypted_secret`; onde existe (o CI), grava os segredos com `vault.create_secret`.
-- A leitura REAL, com o Vault do projeto, só se prova depois da migration e do wizard do canais-15 (ver o handoff do 16).

do $$
begin
  if to_regclass('vault.decrypted_secrets') is null then
    create schema if not exists vault;
    create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
  end if;
end
$$;

create function pg_temp.put_secret(p_name text, p_value text) returns void language plpgsql as $f$
begin
  if to_regprocedure('vault.create_secret(text,text,text,uuid)') is not null then
    perform vault.create_secret(p_value, p_name);
  else
    insert into vault.decrypted_secrets (name, decrypted_secret) values (p_name, p_value);
  end if;
end
$f$;

-- 1. A função existe, e só o service_role a executa.
select has_function('public', 'get_active_unipile_connection', array[]::text[], 'the read function exists');
select is(
  (select has_function_privilege('service_role', 'public.get_active_unipile_connection()', 'execute')),
  true, 'service_role reads the active connection');
select is(
  (select has_function_privilege('anon', 'public.get_active_unipile_connection()', 'execute')
       or has_function_privilege('authenticated', 'public.get_active_unipile_connection()', 'execute')),
  false, 'anon and authenticated cannot read it');

-- 2. A conexão padrão (v2) sem os segredos no Vault: endereço, versão e nomes; chave e segredo nulos.
select is(
  (select count(*)::int from public.get_active_unipile_connection()), 1, 'there is exactly one active connection');
select is(
  (select name || ' ' || api_version || ' ' || base_url from public.get_active_unipile_connection()),
  'padrão v2 https://api.unipile.com', 'it reads the default connection address and version');
select is(
  (select api_key_secret_name || ' ' || webhook_secret_name from public.get_active_unipile_connection()),
  'unipile_padrao_api_key unipile_padrao_webhook_secret', 'it reads the names of the Vault secrets');
select is(
  (select api_key is null and webhook_secret is null from public.get_active_unipile_connection()),
  true, 'without the secrets in the Vault, the key and the webhook secret are null');

-- 3. Com os segredos no Vault, a função os devolve.
select pg_temp.put_secret('unipile_padrao_api_key', 'chave-do-vault-padrao');
select pg_temp.put_secret('unipile_padrao_webhook_secret', 'segredo-do-vault-padrao');
select is(
  (select api_key || ' ' || webhook_secret from public.get_active_unipile_connection()),
  'chave-do-vault-padrao segredo-do-vault-padrao', 'it reads the key and the webhook secret from the Vault by name');

-- 4. Trocar a conexão ativa troca o que a função devolve: só a nova, com os segredos dela (nunca os da anterior).
select pg_temp.put_secret('unipile_teste4_api_key', 'chave-da-conta-v1');
select pg_temp.put_secret('unipile_teste4_webhook_secret', 'segredo-da-conta-v1');
select public.activate_unipile_connection(
  public.register_unipile_connection('teste-4', 'https://api68.unipile.com:19840', 'v1', 'unipile_teste4_api_key', 'unipile_teste4_webhook_secret'));
select is(
  (select name || ' ' || api_version || ' ' || base_url || ' ' || api_key || ' ' || webhook_secret
     from public.get_active_unipile_connection()),
  'teste-4 v1 https://api68.unipile.com:19840 chave-da-conta-v1 segredo-da-conta-v1',
  'after the swap it reads the new connection with its own secrets');
select is(
  (select count(*)::int from public.get_active_unipile_connection()), 1, 'still exactly one connection after the swap');

-- 5. Uma conexão ativa cujos segredos não estão no Vault devolve nulos, sem erro e sem usar os de outra conexão.
select public.activate_unipile_connection(
  public.register_unipile_connection('teste-5', 'https://api2.unipile.com:13211', 'v1', 'unipile_teste5_api_key', 'unipile_teste5_webhook_secret'));
select is(
  (select api_key is null and webhook_secret is null from public.get_active_unipile_connection()),
  true, 'a connection without secrets in the Vault returns nulls, never another connection''s key');

-- 6. Sem nenhuma conexão ativa, não devolve linha: o canal fica desligado.
update private.unipile_connections set active = false;
select is((select count(*)::int from public.get_active_unipile_connection()), 0, 'no active connection, no row');

-- 7. Nenhuma coluna da tabela guarda o segredo, e a função não grava nada.
select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'private' and table_name = 'unipile_connections'
      and column_name in ('api_key', 'webhook_secret', 'secret', 'token', 'password')),
  0, 'the table still keeps no secret in text');

select * from finish();
rollback;
