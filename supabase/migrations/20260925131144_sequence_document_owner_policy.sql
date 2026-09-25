-- Defense in depth: even if table/schema access is granted later, a signed-in
-- user can only select their own private sequence documents.
create policy "sequence owner reads private document"
  on private.sequence_documents
  for select to authenticated
  using ((select auth.uid()) = owner_user_id);
