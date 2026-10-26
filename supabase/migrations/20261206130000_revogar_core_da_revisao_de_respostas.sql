-- O invólucro aplica os campos de retenção seletiva; authenticated não deve chamar o core diretamente.
revoke all on function public.list_sequence_reply_review_core(uuid) from public, anon, authenticated;
