import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Se quem está logado é da equipe Althius, pela função `viewer_is_althius_staff` do banco. Na dúvida (erro, rede, sem
 * sessão), não é: quem pergunta só esconde, nunca libera.
 */
export async function viewerEhDaEquipeAlthius(cliente: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await cliente.rpc('viewer_is_althius_staff')
    return !error && data === true
  } catch {
    return false
  }
}
