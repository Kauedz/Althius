# 03: Provisionamento só pelo staff

**What to build:** `public.staff_provision_workspace(p_name, p_admin_email, p_tier_id, p_initial_credits)`.

**GATE:** exige `private.is_althius_staff(auth.uid())`; sem tela; sem escrita em `auth.users`; só `service_role`/`authenticated` com a checagem dentro.

**Blocked by:** 01.

**Status:** ready-for-human

## Pode mexer
- `supabase/migrations/20261016120000_provisionar_workspace_pelo_staff.sql`

## Critérios
- [x] Cria Workspace da empresa, contrato ativo, `grant_credits('plano')`, limite mensal em créditos, Teto interno da faixa e convite de administrador, numa transação.
- [x] Não staff é recusado; faixa inexistente e e-mail inválido são recusados sem criar nada.
- [x] Devolve o Workspace e o token do convite.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan.**

1. Incluir quem pode provisionar em `private.althius_staff` (a lista começa vazia), no SQL Editor:

```sql
insert into private.althius_staff (user_id) values ('<user-id-do-staff>') on conflict do nothing;
```

2. Provisionar um cliente (no SQL Editor, com as claims do usuário staff; `auth.uid()` não existe no editor):

```sql
begin;
select set_config('request.jwt.claims', '{"sub":"<user-id-do-staff>","role":"authenticated"}', true);
select * from public.staff_provision_workspace('Nome da empresa', 'admin@empresa.com.br', 'essencial', null);
commit;
```

3. O retorno traz o `invitation_token`. O link do convite é `https://<app>/convite/<invitation_token>`: enviar ao administrador do cliente.
