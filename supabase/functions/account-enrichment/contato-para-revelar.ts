import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

// O cliente da sessão aplica RLS ao Contato, Vínculos ativos e Conta-alvo.
export async function contatoParaRevelar(cliente: SupabaseClient, workspaceId: string, contactId: string) {
  const { data, error } = await cliente
    .from('contacts')
    .select('name, linkedin, workspace_id')
    .eq('id', contactId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (error || !data) return null
  const { data: vinculo, error: erroVinculo } = await cliente
    .from('contact_account_links')
    .select('target_accounts(name)')
    .eq('workspace_id', workspaceId)
    .eq('contact_id', contactId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (erroVinculo) throw erroVinculo
  const conta = vinculo?.target_accounts as unknown as { name: string } | null
  return { name: data.name, linkedin: data.linkedin ?? undefined, companyName: conta?.name }
}
