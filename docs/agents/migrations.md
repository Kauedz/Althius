# Migrations

Migrations live only in `supabase/migrations/` as `<UTC timestamp>_<slug>.sql`. The version orders them, and a fresh database applies them in that order: CI does exactly this (`.github/workflows/ci.yml`), and so will the future self-hosted Supabase (ADR-0013).

## Writing one

- Depend only on objects created by earlier versions.
- Fix an applied migration with a new migration; the applied file stays as it is.
- Enable RLS explicitly on every new `public` table. The remote project also has the `ensure_rls` event trigger, created in the dashboard, so a table that relies on it gets RLS only there.
- Guard objects that exist only on the remote (such as `public.rls_auto_enable()`) with `to_regprocedure`/`to_regclass`, so the file also applies on a fresh database.

## Validating on the remote

Run everything through the Supabase MCP `execute_sql`, inside a transaction that rolls back:

1. `begin;`, the migration's text, the checks that prove it works, then `rollback;`. `execute_sql` returns the result of the last row-returning statement.
2. For each pgTAP file the migration touches, run `scripts/pgtap-no-remoto.sh supabase/tests/<file>.sql` and paste its output into `execute_sql`. Done when `falhas` is 0 and `total` equals the file's `plan`.

## Applying on the remote

Apply once CI is green, right before merging. Use `execute_sql`, because `apply_migration` stamps its own version, which then diverges from the file name.

1. Send one atomic block that holds the file verbatim, executes it and writes the history row; an error applies nothing:

   ```sql
   do $apply$
   declare
     m text := $m$<file contents, verbatim>$m$;
   begin
     execute m;
     insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
     values ('<version>', '<slug>', array[m], '<who applied it>');
   end
   $apply$;
   ```

   The file itself uses `$$`; the outer tags `$apply$` and `$m$` avoid colliding with it.
2. Check that `md5(statements[1])` in `supabase_migrations.schema_migrations` matches `md5sum` of the file, and that the security advisors show nothing new.
