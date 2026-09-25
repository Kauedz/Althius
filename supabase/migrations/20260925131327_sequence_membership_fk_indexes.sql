-- Cover foreign-key lookups used by membership checks and owner cleanup.
create index if not exists workspace_memberships_user_id_idx
  on public.workspace_memberships (user_id);
create index if not exists sales_responsibilities_owner_user_id_idx
  on public.sales_responsibilities (owner_user_id);
create index if not exists sales_responsibilities_workspace_owner_idx
  on public.sales_responsibilities (workspace_id, owner_user_id);
create index if not exists sequences_owner_user_id_idx
  on public.sequences (owner_user_id);
create index if not exists sequences_workspace_owner_idx
  on public.sequences (workspace_id, owner_user_id);
create index if not exists sequence_documents_owner_user_id_idx
  on private.sequence_documents (owner_user_id);
